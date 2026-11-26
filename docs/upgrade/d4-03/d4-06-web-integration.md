# D4-06 Web existing-model integration candidate

Date: 2026-11-26 Asia/Shanghai. Accepted source baseline: `9fe8824754af4e8b541f3550e677564183fa7c1f`. This candidate is prepared for `d4/native-integration-candidate-1`. **Local source/text inspection only; no local builds, browser runs, SQLite execution or tests. Cloud results must be attached before acceptance.**

## Existing interface and admission boundary

The accepted D4 domain already imports the unchanged `src/model.mjs`, `schedule.mjs`, `task-tree.mjs`, `task-editor.mjs` and `personal-ui.mjs`. Production Web storage is `src/storage.mjs` `readState`/`writeState`, using the existing replica calls through `/api/sync`; `src/sqlite-store.mjs` persists `tasks.sqlite`. The route name does not mean that a replica local write itself connects to a remote server. This candidate changes none of those files, endpoints, models, tables or replica semantics.

`prototypes/d4-06/v2-service.mjs` adds an explicit storage port and asynchronous operation service over the **existing** V2 entities. It has no default storage, seed, account, fetch implementation, native bridge or remote connector. Creating a service performs no I/O. Each operation reads through the bound interface, performs the existing domain operation, validates the original V2 shape, and returns only the value accepted by storage. Serialized operations recover after a rejected write without reporting the failed data as saved.

For this admission stage, `bindExistingV2Storage` requires `scope: isolated-synthetic` and a concrete storage identity. This is an auditable caller contract; it cannot sandbox an arbitrary injected function. Production binding is refused. A future approved composition may provide existing `readState` and `writeState` already scoped to an approved account. The candidate does **not** mount that binding into the accepted Demo or call the live `/api/sync` endpoint.

| Data | Existing contract | Candidate behavior |
|---|---|---|
| Tasks/subtasks | Unchanged V2 nested tasks | Existing saveTaskRecord, quickSubtask, setTaskDone, moveTask and validation; retains nested location and repeat generation |
| Notes | Separate V2 notes | Create/edit through the same explicit storage; does not modify task content |
| Projects | id/name/description/archived | Create only using existing fields; task project-name semantics unchanged |
| Tags/places | Existing string lists | Existing task classification behavior |
| Pomodoro | Existing isolated personal/native timer boundary | No translation into V2 notes, tasks, settings or a hidden JSON field |
| Work items, projectMeta, taskLinks, templates, processes, contacts, attachments | No admitted production model | Explicit rejection at the port/service boundary; accepted synthetic relations stay in the existing Demo |

The new entity admission gap cannot be solved by putting JSON in descriptions or renaming a mock adapter. A concrete subsequent proposal must separately approve entity storage, relation/deletion rules, template snapshot/version history, attachments, and cross-platform compatibility. No D2 code is used.

## Visual diagnosis and candidate

Existing raw evidence: accepted run `45677279106`, `android-native-work-time-preserved.png` and `android-native-work-edited.png`. Inspection used their existing 443×960 previews, preserving the 1080×2340 originals.

Ranked, falsifiable hypotheses:

1. **Observed:** a default `pre` preserves a single unbroken line. Predicts text rectangles and scrollWidth beyond the modal at 360/412px. Use scoped pre-wrap/overflow-wrap:anywhere with original text unchanged.
2. **Unconfirmed:** a focused work textarea is detached without its normal blur lifecycle; WebView can retain a stale editing highlight. Predicts a connected blur event is missing at keyboard submit, and normal blur-before-removal removes the unintended saved-view highlight.
3. **Unconfirmed:** trusted native touch leaves an actual document Selection. Read selection text/ranges/anchor/focus before and after the native edit; no selection-clearing workaround is allowed.
4. **Unconfirmed:** the blue patch is transient WebView tap/selection drawing without a DOM selection. Requires native screenshot plus trace; desktop DOM checks alone cannot prove this root cause.

Candidate styles give work notes and history JSON explicit wrapping, preserving spaces/newlines/IDs/timestamps. Note typography inherits the readable UI font. `releaseWorkEditorFocus` blurs only a focused work form field immediately before modal removal/replacement. It does not call removeAllRanges, change user-select, hide selection styling or prevent text selection.

The new six browser checks cover 360×800, 412×915 and 1440×960: real rendered text bounds, no modal horizontal overflow, original precise timestamps/text, connected blur before removal, empty saved-view selection, and deliberate selection of the full displayed note. Browser touch submission is used at mobile widths; the browser input fixture is not Android native-keyboard evidence. The original 158 checks remain intact, so the expected count is 164 only if all original checks plus these six execute. Native WebView screenshot/trace remains separately required before declaring the blue-highlight issue fixed.

## Actions commands and artifacts

Keep existing source/ref/scope checks and exact source SHA enforcement; the new branch and `prototypes/d4-06/` path need explicit scope admission. Do not loosen frozen production guards. No runtime dependencies were added.

```
node --test --test-reporter=tap tests/d4-ui/web-service.test.mjs
node tests/d4-ui/build-demo.mjs "$RUNNER_TEMP/d4-ui-$GITHUB_RUN_ID"
node tests/d4-ui/run-browser.mjs "$RUNNER_TEMP/d4-ui-$GITHUB_RUN_ID"
```

Run the service test on Windows and Ubuntu with Node 24 and exact Actions identity (`EXPECTED_SOURCE_SHA=GITHUB_SHA`, run/attempt, `RUNNER_TEMP`). It includes four focused service cases and one actual existing-storage/SQLite case. The latter dynamically imports unchanged `src/storage.mjs`/`sync-client.mjs`; an in-process isolated fetch transport routes only replica inspect/state/commit into unchanged `createSQLiteStore`, then closes/reopens the real temporary SQLite file. It is **not** a live HTTP-server/API or remote sync test.

Upload per-platform TAP and `$RUNNER_TEMP/d4-web-v2-*/d406-service-receipt.json` plus the synthetic `tasks.sqlite` file. The browser output adds `d406-web-visual-receipt.json`, existing `browser-results.json`, and `screenshots/d406-notes-{wrapped,after-edit,selection}-{360,412,1440}.png`. Capture the original PNG; review only derived thumbnails unless a crop is necessary. Retain every old artifact, raw failure and original count.

The parent integration report must supply actual source SHA, Actions run/attempt, job result, raw reports, artifact hashes and observed count. No local or planned test is represented as a pass.

## Unresolved production and historical limits

Real storage/account admission, new work entity models and relationship migration remain blocked. Production sync, ACK/outbox/cursor/manifest/batch semantics, LAN/WebDAV, stable signing/overwrite upgrade, true user DB migration, master/main merge and issue closure remain outside this package. Existing D4-03 historical failures and production blockers stay open. D4-06 is a candidate service seam with isolated integration evidence, not a completed production Web rollout.
