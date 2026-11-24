# D4-01 mature task logic in the offline discussion prototype

2026-11-25 (Asia/Shanghai). This document describes source facts. Execution and browser acceptance remain UNVERIFIED until the matching Actions receipts exist.

FACT (source): `prototypes/d4-01/domain.mjs` imports actual frozen baseline modules. No production `src` file is edited. It does not import production storage, account/replica/native bindings, reminder startup or sync-client. The prototype holds normalized V2 state and isolated mock extensions in memory, and optionally serializes them only under `mytodo-d4-01-demo-v1`.

The actual reuse graph is:

| Frozen module | Actual functions used |
| --- | --- |
| `src/task-tree.mjs` | `findTaskEntry`, `findTask`, `flattenTasks`, `moveSubtask`; descendants remain in their containing arrays |
| `src/schedule.mjs` | `setTaskDone`, `nextOccurrence`, `reminderTime`, `taskStats`, schedule labels and Shanghai time parsing/formatting |
| `src/model.mjs` | `normalizeState`, `seedState`, `visibleTasks`, `searchAll`, `matchesQuery`, `moveTask`, ID validation and date helpers |
| `src/task-editor.mjs` | `saveTaskRecord` for both roots and nested saves; `quickSubtask` for inherited quick-child defaults and limits |
| `src/personal-ui.mjs` | `validateSchedule`; its UI render functions are not invoked |
| `src/sync-core.mjs` | Pure transitive dependency required by the unchanged task-editor module; the facade always passes `base=null`, so it does not invoke merge/sync exchange |

FACT (source): normalization, search, tree iteration, repeat calculation, descendant rekeying/reset/time shifting, reminder calculation and order calculation are not reimplemented. The facade adds transaction boundaries, generated synthetic IDs, cloned snapshots, isolated persistence and listener notifications. Creating/editing a task uses actual `saveTaskRecord`; completing a task, including a changed `done` field in `updateTask`, uses actual `setTaskDone`. Deletion splices the actual `findTaskEntry` containing array, matching the mature app's orchestration. Failed mutations never replace the accepted in-memory state.

FACT (source): core fields remain mature V2, including Boolean `done`, local Shanghai `start`/`end`, project **name**, nested `subtasks`, repeat rules and reminder rules. The prototype does not add `status` or `projectId` to core tasks. Work-module `projectId`, participants, meetings and similar discussion-only extensions live in `demo`; the normalizer is not bypassed. Existing group/project behavior keeps name-based associations.

## Facade API

Classic output exposes `globalThis.DemoDomain`. The ESM source exports the same named interface for Actions tests.

```javascript
const repo = DemoDomain.createRepository({
  state: coreV2Seed,
  demo: mockWorkSeed,
  storage: null, // explicit memory; omit to try the dedicated browser key
  clock: () => '2026-11-25T04:00:00.000Z',
  idFactory: () => 'caller-supplied-unique-synthetic-id'
});
```

`clock` returns an ISO instant. Defaults use the actual current instant; mature `dayKey` determines the Shanghai day. A supplied seed controls the discussion factory date. Neither clock nor storage is used to invent production build/version history.

| Interface | Result / behavior |
| --- | --- |
| `state`, `getState()` | Cloned normalized V2 snapshot |
| `demo`, `getDemo()` | Cloned independent mock snapshot |
| `createTask(fields,parentId=null)` | Saved normalized task; nested creation inherits mature parent defaults |
| `addSubtask(parentId,fieldsOrTitle)` | Saved child; a string calls actual `quickSubtask` |
| `getTask(id)`, `updateTask(id,patch)`, `deleteTask(id)` | Cloned task/null, saved task, removed subtree respectively |
| `setTaskDone(id,done=true)` | Saved task; mature repeat generation occurs once and capacity errors keep old state |
| `listTasks(options)` | Mature filtered roots; `includeSubtasks:true` expands the tree; default pending status |
| `search(query)` | Mature `searchAll` tasks/notes/projects/tags/places with nested content and NFKC AND terms |
| `moveTask`, `moveSubtask` | Actual root/sibling manual order operations |
| `reminderAt(id)`, `nextOccurrence(id)`, `stats(at?)` | Mature calculation results; no OS/browser reminder scheduling |
| `transaction(mutatorCore)` | Apply a synchronous mutation to a cloned core, then normalize and commit atomically |
| `batch(fn)` | Synchronous workspace operation; nested core/mock edits defer to one combined persistence write and one `batch` event; any failure restores both snapshots |
| `replaceState(next,{preserveDemo:true})` | Replace normalized core; keep independent mock state by default |
| `updateDemo(patchOrMutator)` | Apply a shallow patch or synchronous mutation to independent JSON mock state |
| `reset(next?)`, `subscribe(listener)` | Reset to seed/explicit V2; subscribe to cloned core plus event/mock snapshots |
| `persistence()` | Dedicated key, localStorage/memory mode, load status and actual storage error |

`DemoDomain.QUADRANTS` and `DemoDomain.helpers` expose direct mature references for display and calculations. Full snapshots are read-only by convention because getters clone them; writes use the facade. Use `batch` whenever a UI operation changes both core and mock metadata: one stored envelope and one notification describe the final combined state. Nested batches share the outer rollback; even a caught nested failure rejects the outer operation. Async callbacks/Promise results are refused. Invalid/foreign/corrupt persisted data is preserved and the repository falls back to an independent memory seed. A quota/security failure after an accepted batch preserves the complete current workspace in memory. No production key is read or overwritten.

## Single-file offline build

FACT (source): `tests/d4-ui/build-demo.mjs` reads only the approved pure graph and `index.html`, `styles.css`, `work-pages.js`, `app.js`. It transforms only known named ESM imports/exports into isolated classic namespaces, checks dependencies and cycles, and syntax-compiles the complete classic bundle with Node's built-in VM. It does not execute browser UI code and needs no npm packages.

Known script/stylesheet references are replaced by inline CSS and a single classic script in graph → `DemoDomain` → work pages → app order. Unknown script/stylesheet/media dependencies, external CSS imports, unbundled CSS assets and residual ESM are refused. Replacement callbacks preserve literal `$` patterns in source. The result requires no local HTTP server or module fetch, so Windows `file://` can load its resources. Actual browser interaction and file-origin persistence still need UI acceptance; file-origin storage restrictions are handled by the facade's memory fallback.

```shell
EXPECTED_SOURCE_SHA=$GITHUB_SHA node --test tests/d4-ui/domain.test.mjs
EXPECTED_SOURCE_SHA=$GITHUB_SHA node tests/d4-ui/build-demo.mjs "$RUNNER_TEMP/d4-ui-$GITHUB_RUN_ID"
```

Both commands refuse local execution. The builder additionally checks actual Git HEAD, run/attempt, and a fresh direct `RUNNER_TEMP/d4-*` output directory. It emits `mytodo-d4-01-demo.html` and `build-receipt.json` with original input byte lengths/SHA-256, the exact dependency/export graph, actual UTC build time, source/run/attempt and output SHA-256. Frozen `src` input hashes provide actual-source reuse evidence; no fabricated checksum is supplied.

PROPOSAL / UNVERIFIED: seventeen named logic cases cover actual function identity, root/nested CRUD, schedule validation rollback, completion/descendant repeat behavior, edit-done delegation, month-end anchors, capacity failure rollback, Shanghai reminders, mature search/groups, root/sibling order, isolated persistence, restricted storage/quota fallback, malformed data preservation, batch/mock independence, export/import normalization/refusal, one-write nested workspace batches, and full workspace rollback/async refusal. The import boundary does not interpret mock `status`/`projectId` as core completion/association, and invalid versions/duplicate IDs preserve accepted state. Only the Actions result can state pass/fail. No local Node/Python/project tests were run.

FACT (source review after CI2 run `45509156364`, source prefix `8f8f418`): the edit-done reference comparison had unequal fixture inputs. Repository creation omitted `start`, selecting its mature `09:00` default, while the independent `task()` fixture selected `10:00`. The corrected test explicitly supplies the same `2026-11-25T10:00` start to both inputs. The exact next-occurrence equality assertion and all seventeen named cases remain; no facade or production module semantics change. Original CI2 failure evidence is retained, and the corrected cloud rerun remains UNVERIFIED.

PROPOSAL / UNVERIFIED: `tests/d4-ui/interaction-cases.mjs` exports `runCases(api)` for the root's real Chrome/CDP harness. Cases navigate eleven actual route buttons, submit actual task/filter forms, exercise invalid schedule refusal, nested CRUD, retimed single repeat generation, reminder center, mature search fields, deletion/next-copy association, settings/build identity and marked export. Observations use the exposed read-only repository snapshots; no test mutates task state through a hidden shortcut. Browser execution, screenshots and pass/fail are supplied only by the guarded cloud harness.

BLOCKER / OWNER DECISION: D4-01/02 is a discussion prototype. Final Qt/Android implementation follows UI acceptance. No D2 merge, real database, sync activation, LAN service, account or authenticated remote operation is part of this package. OS notifications, multi-user work-module persistence and production activation remain outside this prototype.
