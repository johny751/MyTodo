# D4-03 H05 focused compatibility repair — static handoff

Status: PROPOSAL implemented in the isolated candidate; execution remains UNVERIFIED until the exact-source GitHub Actions run. This note does not close D4-03 or any native/platform BLOCKER.

## Evidence and scope

- FACT: frozen `src/app.mjs` uses `canLeaveEditor()` before leaving an editor, commits nonblank quick-child input, saves before completion, and saves the parent before adding a quick child. Frozen `src/task-editor.mjs` provides `saveTaskRecord(state,updated,base,parentId)` with a three-way merge, conflict copies, current containing-array lookup, and deleted-task refusal. `quickSubtask()` retains multiline content and inherits the parent classifications.
- FACT: the previously delivered isolated `prototypes/d4-01/app.js` closed/replaced its task form and added children without a parent save gate. Its repository always passed a null editor base. Those paths could discard valid dirty parent input or overwrite a concurrent field edit.
- FACT: existing repository persistence intentionally accepts a memory edit after an isolated `localStorage.setItem` failure. Its existing quota-failure assertions require this fallback. This repair preserves that behavior rather than equating memory acceptance with durable storage.
- FACT: edits are confined to the isolated `prototypes/d4-01/app.js` and `domain.mjs`; no frozen production module, database, migration, sync entry, transport, or ACK/outbox/cursor/manifest/batch implementation was edited by this work package. Root owns source publication and cloud evidence.

## Candidate behavior

- PROPOSAL: capture the complete original task as `data-task-base` alongside the original DOM-value baseline. Preserve both when restoring a dirty full-detail page. Only fields actually changed in the editor enter the local patch. `repository.updateTask(id,patch,base)` delegates to the unchanged frozen task-save function; its existing two-argument behavior remains available to other callers.
- PROPOSAL: top close, backdrop close, Web Back adapter, completion, another task/child selection, and modal replacement first save a valid active task draft. Invalid HTML fields, frozen schedule validation, a deleted task, or invalid project-ID selection retain the inputs and block the destructive action. Existing ordinary page navigation retains its draft-memory contract (M18/R01); it does not silently commit another page's draft.
- PROPOSAL: adding a child and leaving/saving with a nonblank quick-child field first commit the parent, then call frozen `quickSubtask` through the provider. The quick field is a textarea, preserving multiline entry. Accepted children clear that input so repeating Back/save cannot add the same quick draft again.
- PROPOSAL: explicit task-form Cancel uses `task-discard` to deliberately cancel the unsaved draft. It is distinct from the save-before-close/Back paths.
- PROPOSAL: conflicts retain the frozen local original ID and remote conflict copy. The isolated ID-based project/work sidecar is copied for conflict descendants from the current source task, and an untouched project picker preserves the latest sidecar link. No real remote connection is involved.
- PROPOSAL: an isolated persistence error keeps the accepted edit and its editor visible, reports “仅保存在当前会话内存”, and blocks subsequent save-dependent exit/completion/child creation. Intentional memory-only storage with no error continues to operate. If a child's own write first triggers a storage failure, that child is accepted in memory once and the quick input is cleared; the error remains visible. Reload durability is not claimed.

## Verification required

- UNVERIFIED: root/personal-tools Actions-only R12–R20 cases exercise valid close/Back autosave, HTML/schedule/title failures, completion, multiline quick children, single-add Back, distinct-field merge, same-field conflict descendants, deleted-task refusal, and isolated quota failure. No child-agent local runtime, build, test, or SQLite command was executed.
- UNVERIFIED: the complete existing UI, C0, D1/D2 candidate, and platform suites must run on the published source. Prior failures remain evidence; successful browser behavior does not prove Android hardware Back, touch behavior, foreground notification, lock-screen/background timer behavior, native SQLite, or installed Windows behavior.
- BLOCKER: previously identified second-bearing custom reminder validation remains unchanged; untouched raw values are preserved and validation failure remains explicit. No assertion or frozen validator was weakened.
- BLOCKER: actual production databases, writer barriers, authenticated remote status, durable multi-file recovery and Android issue #1 remain under their existing separate admission constraints. This UI repair does not authorize production migration, D2 merge, synchronization activation, or LAN/WebDAV dual channels.

## Review notes

- FACT: old H01/H02/H03/H04/H08/H09/H10 rows in historical readiness reports must be read with `static-repair-record.md` and the exact candidate source; they are not a current blanket statement that those static fixes are absent.
- UNVERIFIED: H05 was the highest achievable remaining focused repair found in this review. Its implementation and new regression assertions still require exact-source cloud evidence before it is marked passed.
- OWNER DECISION: retain the separation between preserved navigation drafts, deliberate Cancel, and save-before-close/Back. Production durable recovery after a storage failure is outside the synthetic provider's scope; the current candidate requires retaining/exporting the memory session and reports that limit.
