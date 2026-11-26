# D4-08 explicit existing-model UI composition

Build only in hosted GitHub Actions, with the exact source/run/attempt environment required by the unchanged legacy builder:

```sh
node tests/d4-08/web-build.mjs "$RUNNER_TEMP/d4-service-app"
node tests/d4-08/web-legacy-run.mjs "$RUNNER_TEMP/d4-service-app"
node tests/d4-08/web-run.mjs "$RUNNER_TEMP/d4-service-app/mytodo-d4-01-demo.html" "$RUNNER_TEMP/d4-service-feature-results"
node tests/d4-08/web-service-run.mjs "$RUNNER_TEMP/d4-service-app/mytodo-d4-01-demo.html" "$RUNNER_TEMP/d4-service-results"
node tests/d4-08/web-package.mjs "$RUNNER_TEMP/d4-service-app" "$RUNNER_TEMP/d4-service-feature-results" "$RUNNER_TEMP/d4-service-results" "$RUNNER_TEMP/d4-service-package"
```

Set `GITHUB_SHA`, `EXPECTED_SOURCE_SHA`, and `D408_APP_SOURCE_SHA` to the exact candidate checkout. The output directories must be fresh. The composition builder first invokes `tests/d4-ui/build-demo.mjs` unchanged, then adds only the existing `prototypes/d4-06/v2-service.mjs` and new `prototypes/d4-08/v2-candidate-app.js`. It records the legacy HTML hash, final HTML hash, source input hashes and admitted dependency graph in `build-receipt.json`. Formal `src/` remains unchanged.

The actual mounted panel is under Settings → 现有模型隔离工作区. The owner must explicitly open it before its first read. New/edit project, task, child, completion, quadrant movement and note controls call the existing asynchronous V2 service, which calls an explicitly bound browser storage port. A separate `mytodo-d408-v2-isolated-v1` envelope has a checked kind/scope/storage identity. No production database, SQLite, remote transport, automatic connection, D2 code, new work entity, timer or feedback field enters this V2 storage. The accepted four-quadrant demonstration keeps its own existing repository and key.

The three independent browser cases are S1 actual mounted UI→service→isolated storage→reload, S2 failed durable write with input preservation and same-page retry, and S3 corrupt identity preservation plus refusal of unsupported entities/production binding. The runner creates a new browser profile and fresh context per case, blocks page network requests, and captures raw calls, state, first-failure screenshots and traces. Their counts and report kind remain separate from the 21 new Web feature cases and the unchanged legacy browser suite.

The optional final package requires the same composed HTML to pass all three independent suites. `web-legacy-run.mjs` invokes the unchanged original runner and binds its report to the artifact hash before and after execution. `web-package.mjs` refuses a source/run/attempt/hash mismatch or any incomplete suite. It writes accurate dual-storage documentation and reads every ZIP member back to match bytes and SHA-256. Original reference-demo packaging remains unchanged.

This composition provides evidence for the explicit browser storage port only. The earlier D4-06 in-process service→formal storage adapter→temporary Actions SQLite tests remain a separate chain. No result from either chain establishes production Web integration, cross-device synchronization or production admission. All new code is unverified until its hosted run completes.
