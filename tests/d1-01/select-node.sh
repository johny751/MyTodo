#!/usr/bin/env bash
set -euo pipefail

if [[ ${GITHUB_ACTIONS:-} != true || ${RUNNER_OS:-} != Linux ]]; then
  echo 'This script selects a preinstalled Node for the GitHub-hosted Linux job.' >&2
  exit 1
fi

shopt -s nullglob
candidates=("$(command -v node || true)")
if [[ -n ${RUNNER_TOOL_CACHE:-} ]]; then
  candidates+=("$RUNNER_TOOL_CACHE"/node/*/x64/bin/node "$RUNNER_TOOL_CACHE"/node/*/x64/node)
fi

for executable in "${candidates[@]}"; do
  [[ -x $executable ]] || continue
  if "$executable" -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)'; then
    "$executable" --version
    dirname "$executable" >> "$GITHUB_PATH"
    exit 0
  fi
done

echo 'No preinstalled Node 22.13 or newer was found.' >&2
exit 78
