# D4-09 Web candidate test integration plan

2026-11-28, Asia/Shanghai. Agent: repair_review. Updated after root authorized additive candidate tests while product implementation still waits for the screenshot gate. Despite this requested filename, these tests provide browser UI evidence only; they do not establish Win32 native or Android lifecycle/gesture acceptance.

Source root: `C:/Users/adwoo/Documents/Codex/2026-11-25/x/work/d4-09/source`. Product baseline: `7c217d8779ccf21e13733b28868e015e9cfd693a`. All application execution, JavaScript syntax/runtime checks, tests, SQLite and runnable packaging remain GitHub Actions only. Local work to date is text/source/hash review. New test code is **UNEXECUTED** until the exact-source hosted run; no pass result is asserted here.

## Added files and execution contract

- `tests/d4-09/web/candidate-run.mjs`: independent hosted browser orchestration, adapted from the frozen D408 runner. It does not import or modify any old runner/case.
- `tests/d4-09/web/candidate-driver.mjs`: D409 CDP methods, snapshots and screenshot receipts. Reuses the known CDP behavior in a new module, with explicit hit diagnostics and additional evidence.
- `tests/d4-09/web/candidate-cases.mjs`: 12 shared product UI cases `W409-U01`–`W409-U12`; composed service HTML also executes `W409-S01` and `W409-S02` (14 total).
- Existing `tests/d4-09/web/prototype-cases.mjs` is still the separate 16-case memory-only prototype gate. It cannot establish product acceptance.

Required environment: hosted `GITHUB_ACTIONS=true`; `EXPECTED_SOURCE_SHA=GITHUB_SHA`; `D409_APP_SOURCE_SHA=GITHUB_SHA`; numeric `GITHUB_RUN_ID` and `GITHUB_RUN_ATTEMPT`; `D409_WEB_VARIANT=demo` or `service`; Node 22+ with the hosted Chromium installation. There is no browser download fallback. Checkout HEAD, suite SHA, app receipt SHA, artifact hash, run and attempt must agree. App and suite use the same candidate commit. The explicit variant must match receipt `d408Composition` presence and actual `window.D408V2Candidate` presence.

Input is the existing built HTML inside RUNNER_TEMP. Output is a fresh RUNNER_TEMP directory. Each case receives a fresh isolated browser context, survives reload inside that context, and blocks HTTP/HTTPS/WS/WSS page requests. Contexts are disposed after each case; failures do not prevent independent later cases from collecting evidence. No skip/retry/count reduction is supported.

Commands below belong **only inside GitHub Actions**. `EXPECTED_SOURCE_SHA` and `D408_APP_SOURCE_SHA`/`D409_APP_SOURCE_SHA` are set to the checked-out candidate SHA in job environment. Use the same commands on ubuntu-latest and windows-latest with Bash shell, preserving the existing OS matrix.

```bash
# Ordinary standalone demo: build once, all gates use that exact HTML.
node tests/d4-ui/build-demo.mjs "$RUNNER_TEMP/d4-09-demo"
node tests/d4-ui/run-browser.mjs "$RUNNER_TEMP/d4-09-demo"
node tests/d4-08/web-run.mjs "$RUNNER_TEMP/d4-09-demo/mytodo-d4-01-demo.html" "$RUNNER_TEMP/d4-09-demo-d408-features"
node tests/d4-08/web-work-run.mjs "$RUNNER_TEMP/d4-09-demo/mytodo-d4-01-demo.html" "$RUNNER_TEMP/d4-09-demo-d408-work"
D409_WEB_VARIANT=demo node tests/d4-09/web/candidate-run.mjs "$RUNNER_TEMP/d4-09-demo/mytodo-d4-01-demo.html" "$RUNNER_TEMP/d4-09-demo-ui"

# Actual isolated V2 service composition: separate build, same HTML for every gate.
node tests/d4-08/web-build.mjs "$RUNNER_TEMP/d4-09-service-app"
node tests/d4-08/web-legacy-run.mjs "$RUNNER_TEMP/d4-09-service-app"
node tests/d4-08/web-run.mjs "$RUNNER_TEMP/d4-09-service-app/mytodo-d4-01-demo.html" "$RUNNER_TEMP/d4-09-service-d408-features"
node tests/d4-08/web-service-run.mjs "$RUNNER_TEMP/d4-09-service-app/mytodo-d4-01-demo.html" "$RUNNER_TEMP/d4-09-service-d408-service"
node tests/d4-08/web-work-run.mjs "$RUNNER_TEMP/d4-09-service-app/mytodo-d4-01-demo.html" "$RUNNER_TEMP/d4-09-service-d408-work"
D409_WEB_VARIANT=service node tests/d4-09/web/candidate-run.mjs "$RUNNER_TEMP/d4-09-service-app/mytodo-d4-01-demo.html" "$RUNNER_TEMP/d4-09-service-ui"
```

Root owns workflow steps, final packaging and aggregate gates. Run separate steps or aggregate recorded exit codes so a failure still uploads all available reports; do not quietly make failed gates optional. New UI reports are `d409-web-results.json` inside each `*-ui` directory. Upload both directories with `if: always()`, plus input build receipts/HTML and all old report directories. Suitable artifact names include `d409-web-demo-ui-${RUNNER_OS}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}` and `d409-web-service-ui-${RUNNER_OS}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}`.

## Frozen old suite invocation and limits

| Suite | Entry | Required count | Relevant preserved contract |
|---|---|---:|---|
| Legacy | `tests/d4-ui/run-browser.mjs <build-dir>`; composed wrapper `tests/d4-08/web-legacy-run.mjs <build-dir>` | 164 | All original case modules, embedded Noto font SHA, mobile `.work-record-table`, title action, time-cell labels and row actions, task/drag/history behavior |
| Features | `tests/d4-08/web-run.mjs <HTML> <fresh out>` | 21 | Timer/persistence/history, feedback original bytes and failures, navigation gestures, keyboard/IME behavior |
| Work preservation | `tests/d4-08/web-work-run.mjs <HTML> <fresh out>` | 2 | Rich template definitions/version/instance snapshots; exact time offset/ms, unknown/null/absent fields and missing relations |
| Actual V2 service | `tests/d4-08/web-service-run.mjs <HTML> <fresh out>` | 3 | Service writes/reload, same panel DOM and cross-route draft, quota failure retaining durable bytes/input and one retry, wrong-identity/unsupported refusal |

The 21/2/3 runners take `D408_APP_SOURCE_SHA` separately from suite SHA. For the new candidate matrix set both to the candidate SHA. `web-work-run` and `web-service-run` set their suite mode then import the top-level `web-run.mjs`; the latter exports no harness. Importing it as a helper would actually run an old fixed-count suite. No injection or environment monkeypatch is used to insert D409 cases into the old suite.

The old 164 runner is monolithic and aborts later cases after a failure; retain its original executed/remaining counts. Many of its helper clicks are DOM `.click()`, while specific gesture cases use real CDP. Do not describe all 164 as real hit-tested input. D408 21/2/3 and new D409 click helpers check hit points then dispatch actual CDP mouse input. New `fill()` is explicitly logged as field value + input/change events; keyboard cases use CDP key/insertText events instead.

The old `web-legacy-run.mjs` wrapper binds report/runner hashes to the same before/after HTML bytes. The old `web-package.mjs` requires five distinct direct RUNNER_TEMP/d4-* directories, complete counts and exact report identities, and emits D408-labeled packaging. Preserve it. A root-owned D409 outer packager must additionally bind both new UI reports and visual evidence, without relabeling old reports as D409 or using older baseline-input verifier success as final candidate acceptance. The historical D408 workflow baseline targets `04c525c55fc136ad1b960b5d727dab3c5e3165fd`; it is not D409 accepted baseline `7c217d8`.

## New case coverage

| ID | Assertions and evidence |
|---|---|
| U01 | 20 actual routes via visible navigation; correct active route/main/title; actual D409 marker; memory prototype absent; dashboard/tasks/settings desktop |
| U02 | Read-only work selection leaves exact main and V2 storage bytes unchanged; desktop split; no duplicate preview form; original full detail/editor/save/reload |
| U03 | Projects/templates/processes/contacts side panels; original data unchanged; separate preview action namespace; no cloned forms; desktop screenshots |
| U04 | 360/412/768 start with old list visible; immediate menu hit after desktop resize without settle/sleep; explicit detail/back; no durable selection write; list/menu/detail images |
| U05 | Explicit synthetic historical work fixture: offset and ms timestamp, long unknown time, null/unknown/missing relationships, opaque extension; full note selected text and wrapping at1440/360/412; original editor/reload preservation |
| U06 | Real task drawer dirty text, baseline/taskBase and input order preserved through unrelated repaint; same focus/caret; no accidental save; explicit cancel restores original |
| U07 | Notes plain Enter adds newline; Ctrl+Enter saves; reload, edit cancel, delete cancel/confirm, tasks unaffected; wide/narrow note images |
| U08 | Existing timer focus/history split and narrow vertical layout; actual elapsed real clock (no fake clock); live config DOM/draft survives tick; route return, pause/resume/finish/history reload |
| U09 | Modal role, title, close, real reachable save at360/412/1440; focus Tab/Shift+Tab loop and Escape; form and focus screenshots |
| U10 | Analytics/catalogs/timeline/archive/sync/devices/data/about readable viewport geometry and snapshots at1440/360/412; real version-history dialog |
| U11 | Empty filter hides stale detail; restored filter and new selection; archive removes selected entity from current preview; archived content remains reachable |
| U12 | Browser-generated synthetic original PNG File with SHA/size; feedback title/body/File bytes survive unrelated repaint; existing save/detail/reload; no OS picker claim |
| S01 | Actual V2 creation changes only V2 storage; selection is read-only; same panel DOM through unrelated repaint and route return; unsaved draft; responsive screenshots; real save/reload |
| S02 | Actual V2 narrow quota failure preserves exact two-domain durable bytes/state/input; submit remains hit reachable; fault release and exactly one successful retry/reload |

Counts remain distinct: prototype16; old164/21/2/3; candidate demo12 and service14. No total pass count is claimed before hosted reports exist. Existing old tests already cover thousands of timer-history entries, templates, pending operations, image imports/tombstones/generations/batches, and IME/short/long/swipe exclusions. New cases target the UI changes rather than reproducing all old behavior.

## Product DOM integration contract

Tests have been written before product integration and deliberately require new visible behavior. Until product source is authorized and implemented they will fail; do not bypass those requirements to make the baseline green.

- `body[data-d409-ui]` distinguishes the actual redesigned candidate; no `window.D409WebPrototype` memory-only replacement.
- Five work routes expose `[data-d409-work-layout]`, `[data-d409-work-list]`, `[data-d409-work-preview][data-preview-id]`.
- Selection button: `data-action="work-preview-select"`, `data-id` is the actual entity ID. Preview uses `work-preview-detail`, `work-preview-edit`, and `work-preview-back`; full notes use `[data-d409-preview-notes]`. IDs/actions retain existing separate old selectors.
- Preview has no form/input/textarea/select or duplicate old business-action buttons. Empty/excluded/deleted selection cannot advertise a stale `data-preview-id`.
- Desktop list/detail show alongside; ≤960 initial route shows the list, explicit selection shows detail and reachable back.
- Timer keeps existing anchors/actions and adds `.d409-timer-layout` and `[data-d409-timer-history]`; same config form remains live during tick.
- Modal header derives actual existing dialog title, while old form controls/names/hidden values/order and keyboard lifecycle remain intact.

These attributes store no business data and add no transaction. All edits/saves remain original implementation functions. `mobile-controls.js` remains Android-agent-owned; no edit to it is made by this agent.

## Evidence and failure review

Each new report records suite/app/source SHA, exact run/attempt/OS/variant, HTML SHA, build-receipt SHA, runner/helper/case file hashes and the frozen harness source hash. Input trace records actual hit targets/geometry, mouse/key/text operations and named synthetic fixture expressions. Snapshots add both exact durable storage strings and SHA hashes, core/demo/V2 state, dirty/baseline/taskBase/memoryOnly, named form controls and file SHA/size, focus/caret, text selection, main/quadrant scroll and selected preview.

Every screenshot is original PNG, with SHA256, byte length, dimensions, viewport/DPR/route/modal/scroll geometry in the report. Root collector makes ≤960 longest-edge thumbnails (phone about360px wide), stores original path and SHA, and records preview-to-original scaling. Do not overwrite originals or inline base64. Screenshot selection is browser Range rendering only; touch/gesture/browser File fixture evidence is not Android long-press, system back, insets, picker or background-service proof. The Web runner does not launch a native executable.

First failure keeps original error/stack, independent snapshot and screenshot capture attempts, raw trace and browser stdout/stderr. Each independent case continues after failure; there is no rerun inside a case. A click failure records all nine hit points and the obstructing element. Raw resize case has no wait or animation settle before the first hit, preventing an eventual settled screenshot from hiding an initial obstruction.

Review each failure as product, harness, environment, or incomplete evidence, with supporting raw records. Driver defects require a new source SHA/run and preserved original failure artifacts; do not change old assertions, force clicks, add sleeps/retries or silently skip cases. Original `46084728532/a1` prototype failures remain in the evidence chain; its heading and narrow sidebar repair does not establish that actual product UI passes.

Final acceptance requires old and new exact-count reports on both OS, shared HTML hashes within each variant, source/raw artifacts, complete screenshots and human review of typography, clipping, contrast and focus/selection. Browser checks are necessary but do not close native or production blockers.
