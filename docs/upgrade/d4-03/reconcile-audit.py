#!/usr/bin/env python3
"""Static Git blob provenance reconciliation; never imports or executes MyTodo.

Run only in authorized GitHub Actions or Codespaces. This tool reads Git source
objects and audit JSON, and writes evidence to a fresh directory outside the repo.
It does not build, test, access SQLite, run applications, or change source files.
"""

import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import zipfile


BASE = "d4c5af4cbbb9192c19276dd371bd142c2b835534"
MANIFEST = "docs/upgrade/d4-03/audited-source-manifest.json"
ALLOWED_RECONCILIATIONS = frozenset({
    "src/sync-server.mjs", "src/sqlite-store.mjs", "src/replica.mjs",
    "src/model.mjs", "src/delta-sync.mjs", "windows/sync.c",
    "windows/native.h", "windows/database.c", "windows/credential-helper.c",
})


def sha256(value):
    return hashlib.sha256(value).hexdigest()


def git(*args):
    process = subprocess.run(["git", *args], check=False, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE)
    if process.returncode:
        raise RuntimeError("Git evidence read failed: " +
                           process.stderr.decode("utf-8", "replace"))
    return process.stdout


def descriptor(value):
    return {"bytes": len(value), "sha256": sha256(value)}


def matches(record, value):
    return record.get("bytes") == len(value) and record.get("sha256") == sha256(value)


def write_json(file, value):
    file.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8", newline="\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-head", required=True,
                        help="Exact authorized candidate checkout SHA")
    parser.add_argument("--output", required=True,
                        help="Fresh absolute cloud evidence path outside the Git repo")
    args = parser.parse_args()
    if os.environ.get("GITHUB_ACTIONS") != "true" and os.environ.get("CODESPACES") != "true":
        raise RuntimeError("Authorized cloud static evidence environment required")
    if not re.fullmatch(r"[a-f0-9]{40}", args.expected_head):
        raise RuntimeError("Full exact expected checkout SHA required")
    head = git("rev-parse", "HEAD").decode("ascii").strip()
    if head != args.expected_head:
        raise RuntimeError("Checkout identity differs from authorized candidate")
    if git("rev-parse", BASE + "^{commit}").decode("ascii").strip() != BASE:
        raise RuntimeError("Frozen base identity differs")
    repo = Path(git("rev-parse", "--show-toplevel").decode("utf-8").strip()).resolve()
    output_arg = Path(args.output)
    if not output_arg.is_absolute():
        raise RuntimeError("Absolute evidence path required")
    output = output_arg.resolve()
    if output == repo or repo in output.parents or output.exists():
        raise RuntimeError("Fresh evidence path outside repository required")
    if not output.parent.is_dir():
        raise RuntimeError("Evidence parent directory must already exist")

    original = (repo / MANIFEST).read_bytes()
    committed = git("show", head + ":" + MANIFEST)
    if original != committed:
        raise RuntimeError("Working audit manifest differs from exact candidate Git object")
    manifest = json.loads(original.decode("utf-8"))
    if manifest.get("baseline") != BASE or not isinstance(manifest.get("files"), list):
        raise RuntimeError("Audit manifest must declare fixed frozen base and files")
    names = [entry.get("path") for entry in manifest["files"]]
    if len(set(names)) != len(names) or not ALLOWED_RECONCILIATIONS.issubset(set(names)):
        raise RuntimeError("Unique audit coverage including all nine conflicts required")

    output.mkdir()
    original_archive = output / "original-audit-manifest.zip"
    with zipfile.ZipFile(original_archive, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("original/" + MANIFEST, original)
    canonical_archive = output / "canonical-frozen-git-blobs.zip"
    candidate = copy.deepcopy(manifest)
    rows, changes, blockers = [], [], []
    with zipfile.ZipFile(canonical_archive, "w", zipfile.ZIP_DEFLATED) as archive:
        for index, record in enumerate(manifest["files"]):
            name = record["path"]
            if not isinstance(name, str) or not re.fullmatch(r"(?:src|windows|android)/[A-Za-z0-9_./-]+", name) or ".." in name.split("/"):
                raise RuntimeError("Invalid frozen source evidence path")
            canonical = git("show", BASE + ":" + name)
            blob_id = git("rev-parse", BASE + ":" + name).decode("ascii").strip()
            computed_blob_id = hashlib.sha1(b"blob " + str(len(canonical)).encode("ascii") +
                                           b"\0" + canonical).hexdigest()
            if blob_id != computed_blob_id:
                raise RuntimeError("Git blob identity differs from raw bytes: " + name)
            archive.writestr("frozen/" + name, canonical)
            lf = canonical.replace(b"\r\n", b"\n")
            crlf = lf.replace(b"\n", b"\r\n")
            variants = [("canonical-git-blob", canonical),
                        ("CRLF-to-LF", lf), ("LF-to-CRLF", crlf)]
            matching = [label for label, value in variants if matches(record, value)]
            row = {"path": name, "gitBlobSHA1": blob_id,
                   "originalEntry": {"bytes": record.get("bytes"), "sha256": record.get("sha256")},
                   "canonicalGitBlob": descriptor(canonical),
                   "canonicalCRLFCount": canonical.count(b"\r\n"),
                   "canonicalLoneCRCount": canonical.count(b"\r") - canonical.count(b"\r\n"),
                   "LFVariant": descriptor(lf), "CRLFVariant": descriptor(crlf),
                   "matchingOriginalVariants": matching}
            if matches(record, canonical):
                row["status"] = "FACT: exact canonical Git bytes already match"
            elif name in ALLOWED_RECONCILIATIONS and matching:
                row["status"] = "FACT: original entry proven to describe a line-ending variant"
                candidate["files"][index]["bytes"] = len(canonical)
                candidate["files"][index]["sha256"] = sha256(canonical)
                changes.append({"path": name, "proof": matching,
                                "before": row["originalEntry"],
                                "after": row["canonicalGitBlob"]})
            else:
                row["status"] = "BLOCKER: original entry is not an authorized proven line-ending variant"
                blockers.append(name)
            rows.append(row)

    receipt = {"kind": "MyTodo static frozen Git source reconciliation; not project tests",
               "sourceSHA": head, "frozenBaseline": BASE,
               "cloudEnvironment": "GitHub Actions" if os.environ.get("GITHUB_ACTIONS") == "true" else "Codespaces",
               "originalManifest": {"path": MANIFEST, **descriptor(original)},
               "filesExamined": len(rows), "lineEndingCorrections": changes,
               "blockers": blockers, "status": "BLOCKER" if blockers else "FACT: static reconciliation succeeded",
               "productionSourcesChanged": False, "projectTestsExecuted": 0,
               "productionDataAccessed": False, "entries": rows,
               "candidateManifestWritten": False}
    if not blockers:
        candidate_path = output / "audited-source-manifest.candidate.json"
        write_json(candidate_path, candidate)
        receipt["candidateManifestWritten"] = True
        receipt["candidateManifest"] = {"file": candidate_path.name,
                                        **descriptor(candidate_path.read_bytes())}
    receipt["archives"] = [{"file": file.name, **descriptor(file.read_bytes())}
                           for file in (original_archive, canonical_archive)]
    write_json(output / "reconciliation-receipt.json", receipt)
    files = sorted(file for file in output.iterdir() if file.is_file())
    (output / "SHA256SUMS.txt").write_text("".join(sha256(file.read_bytes()) + "  " + file.name + "\n"
                                                 for file in files), encoding="ascii", newline="\n")
    print(json.dumps({"kind": receipt["kind"], "sourceSHA": head,
                      "filesExamined": len(rows), "corrections": len(changes),
                      "blockers": blockers, "candidateManifestWritten": receipt["candidateManifestWritten"],
                      "output": str(output)}, ensure_ascii=False))
    return 1 if blockers else 0


if __name__ == "__main__":
    sys.exit(main())
