# D4-09 actual shared Web presentation integration

2026-11-28, Asia/Shanghai. Product baseline `7c217d8779ccf21e13733b28868e015e9cfd693a`. Root approved implementation after reviewing the prototype direction; prototype timer repair was subsequently seen in hosted source `9aa0d3a`, run `46088001399/attempt1`. This records source preparation, not runtime acceptance. No local application, JavaScript, browser test, build, SQLite or executable packaging was run.

## Changed product files

| File | Final presentation change | Protected remainder |
|---|---|---|
| `prototypes/d4-01/index.html` | `body` adds `data-d409-ui` | Original CSP, roots, script order and resource references unchanged |
| `prototypes/d4-01/styles.css` | Appended D409 theme from shared tokens: light navigation, readable hierarchy, work split panes, timer focus/history, notes/feedback/settings/V2 responsive layouts | Existing CSS prefix retained; no new stylesheet/import/font/network dependency; original task drag/touch rules retained |
| `prototypes/d4-01/app.js` | `context` adds `refreshPresentation:render`; `modal` displays existing first h2 text and labels dialog; `dashboard` adds two CSS order classes and changes greeting text | All original model/save/form/dirty/capture/restore/focus/navigation/back/gesture/listener/timer setup functions retained |
| `prototypes/d4-01/work-pages.js` | Ephemeral preview selection and six helpers; five work route wrappers and preview buttons; one `act` delegation after existing pending-attachment guard | Original entity/detail/forms, filters, validation, transaction/save, time/missing/null/unknown preservation, audit, attachments, archive/delete and process transitions unchanged |
| `prototypes/d4-01/personal-pages.js` | `timerBody` wrapper and statistics class; `timerHistory` container class/data marker | All timer state/clock/native provider/tick, original buttons/config fields/history data, feedback/images/pending persistence and keyboard handlers unchanged |
| `prototypes/d4-08/v2-candidate-app.js` | `content` only: heading, selected card appearance, visible create forms, task/editor panes, notes container | Same key/identity/seed/readEnvelope/bind/mount/draw/run/listeners/observer/export/snapshot; same panelHost object and failure input retention |

`legacy-pages.js` remains byte-identical; its rendered categories and timeline inherit the shared theme. `mobile-controls.js` is owned and changed separately by the Android agent; this Web change does not edit it. Root exclusively owns central GROWTH and release/version/CI/package work.

Work previews read actual existing entities and use an independent in-memory route→ID record. Selection/back call only `refreshPresentation`; no empty transaction or storage write. The five routes retain their old title/detail/edit/archive/delete/process controls, original `.work-record-table` columns and all `data-label` values. Preview controls use the new `work-preview-*` namespace and contain no forms or duplicate old actions. Desktop defaults to the first row; narrow screens begin with the list and switch only after explicit selection. Filtering/archiving/deletion cannot render a stale selected ID. Exact historical times, opaque values, full notes, steps and snapshots remain readable.

Preview notes deliberately use `.d409-preview-note`, **not** `.work-note-content`: frozen Web and Android tests use the latter unscoped to select the original modal note. Preview process steps likewise use `.d409-preview-steps`, not a second original `.process-steps`. This preserves old selector meaning without test edits.

The closed mobile sidebar gets `visibility:hidden`, `pointer-events:none`, `transition:none`; open navigation restores visibility/pointer events. This removes the known initial hit obstruction. Android agent confirmed this matches its native hit-based menu contract. Existing z-index, shade, drag/touch action and original gesture handlers are retained. Main and quadrant scroll storage remains original.

## Exact source anchors for root protection gate

All anchors below use original top-level declarations. Only the listed old functions are permitted to differ; every other existing top-level function and event registration should compare to the baseline Git blob. New functions are separately inspectable.

- **app.js**: allow ` function context(){` through before ` function openTaskGroup(`; ` function modal(` through before ` function navigate(`; ` function dashboard(){` through before ` function options(`. All bytes before/after these three ranges should remain, including `captureForm/restoreForm/remember/captureMain/restoreMain`, `composite/transaction`, task forms/saving, `navigate/back/render/scheduleRender`, `releaseWorkEditorFocus/dismissModal/closeModal`, all document listeners, M.install, setInterval and D4Prototype export. Context change is one returned presentation callback; modal keeps the original lifecycle around its new title text.
- **work-pages.js**: allow one new `var previewByRoute = Object.create(null);`; new block `  function previewButton(` through before `  function projectsPage(` contains six presentation helpers. Allow existing `projectsPage`→before`projectDetail`, `workItemsPage`→before`workDetail`, `templatesPage`→before`processForm`, `processesPage`→before`followupSummary`, `contactsPage`→before`contactDetail`. `act` may only gain `if (action.startsWith('work-preview-')) return previewAction(action, id, ctx);` immediately after the original `pendingAttachment` guard. The remainder of `act` and the complete `submit`, `render`, `seed` and export remain unchanged. No old entity/detail/form helper changed.
- **personal-pages.js**: allow `  function timerBody(` through before `  function timerHistory(` and `  function timerHistory(` through before `  function webPomodoroPage(`. Function logic and interpolation remain; only wrapper/class/data attributes differ. Literal `<div id="personal-timer-content">` and `#personal-native-panels` path remain unchanged.
- **v2-candidate-app.js**: allow `  function content(){` through before `  function mount(){`; all other bytes remain. `mount/draw/run` must be exact, not just equivalent.
- **index.html**: replacing `<body>` with `<body data-d409-ui>` must reconstruct baseline bytes. CSP must remain exactly the baseline value.
- **styles.css**: original prefix before `/* D409 presentation theme.` remains unchanged. New rules must not add external URLs, imports or global selection/gesture prevention. `legacy-pages.js` remains whole-file identical.

Repository original EOL must be preserved. Root may normalize working EOL to exact Git blob conventions before final hashes; no EOL-only full-file change is intended.

## Validation inputs and limits

New runner `tests/d4-09/web/candidate-run.mjs` executes demo12 / service14 cases in hosted Actions; `candidate-driver.mjs` has hit-tested mouse/key input, both exact durable store strings/hashes, files/focus/caret/scroll snapshots and original PNG hashes/dimensions. `candidate-cases.mjs` keeps DOM Range/browser File/real Web clock claims distinct from native OS behavior. `docs/upgrade/d4-09/audits/web-native-test-plan.md` lists commands, directories and full coverage.

Original tests remain untouched: ordinary demo164/21/2; actual service composition164/21/2/3. Each variant's reports must bind the same built HTML and exact source/run/attempt on both OS. New12/14 remain separate counts from the prototype16. Root has wired the candidate workflow. Source preparation and `git diff --check` do not establish syntax, functional, visual or native acceptance; those results remain pending hosted execution and screenshot review. No production schema/model/database/sync/protocol/LAN/WebDAV/signing/main merge admission is implied.
