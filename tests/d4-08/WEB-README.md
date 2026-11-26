# D4-08 independent Web regression

This suite is new. Files in `tests/d4-ui/` are unchanged. It runs 21 independently isolated cases and records every first failure, then continues with a new Chromium browser context. A failed case never becomes an implicit pass or disappears because the suite continues.

## Runtime and commands

Run in GitHub Actions only, using Node.js 24 and the hosted image's existing Chrome, Chromium, or Edge executable. No npm packages or browser download fallback are required. The test process uses Node's built-in WebSocket/CDP client. Page `http`, `https`, `ws`, and `wss` requests are blocked; the local CDP control socket is separate. Each invocation uses one fresh browser profile under `RUNNER_TEMP`; each case gets a fresh browser context.

Build the offline HTML with the existing `tests/d4-ui/build-demo.mjs`. It requires an exact Git checkout matching the build step's `GITHUB_SHA` and `EXPECTED_SOURCE_SHA`, the real Actions run/attempt, and a **new direct child** of `RUNNER_TEMP` whose basename starts `d4-`.

Run from the new candidate suite checkout, with its source SHA in the real `GITHUB_SHA`/`EXPECTED_SOURCE_SHA`. Set `D408_APP_SOURCE_SHA` to the exact source used to build the HTML:

```text
node tests/d4-08/web-run.mjs <RUNNER_TEMP/d4-app/mytodo-d4-01-demo.html> <RUNNER_TEMP/d4-web-results>
```

The result directory must not exist. The runner compares the HTML hash and app source with `build-receipt.json`, verifies its own Git checkout against `GITHUB_SHA`, and records both `suiteSourceSHA` and `appSourceSHA`. It never conflates a baseline application with the new test source.

For baseline reproduction, root's workflow checks out frozen `04c525c55fc136ad1b960b5d727dab3c5e3165fd` into a separate cloud checkout and builds with that SHA scoped to the **build step only**. The runner stays in the new suite checkout and uses `D408_APP_SOURCE_SHA=04c525c55fc136ad1b960b5d727dab3c5e3165fd`. For candidate validation, `D408_APP_SOURCE_SHA` equals the candidate SHA. Do not edit a failed baseline expectation to obtain a passing baseline.

Exit 0 means all 21 executed cases passed and no infrastructure failure occurred. Exit 1 retains a complete failure report. The baseline workflow may explicitly expect failure while always uploading its raw artifacts, but candidate validation must require exit 0. Windows and Ubuntu executions are separate suites/results; do not add them to Android, Win32, C0, or old browser counts.

## Outputs

- `d408-web-results.json`: source/app identities, every case, raw failure/stack, per-gesture or per-route observations, timestamps and counts.
- `d408-web-input-trace.jsonl`: actual CDP mouse/key/touch dispatches; fixture text/file input preparation is explicitly labeled separately.
- `snapshots/*.json`: per-case initial/success/first-failure core, candidate data, persistence mode, original stored JSON, live editor fields and selected-file metadata.
- `screenshots/*.png`: first failure originals and selected success views; never overwritten by a later attempt.
- `chrome-stdout.txt`, `chrome-stderr.txt`: original browser process streams, including startup failures when available.

`N1` retains individual observations for every one of 13 routes at both 360/412 widths before asserting the aggregate. That is one named case with 26 documented parameter observations, not 26 silently claimed extra tests. `T4` is an explicit deterministic clock fixture; `F9` includes deliberate programmatic duplicate-submit stimulation; `N3`'s `gx-back` checks the candidate browser bridge event only. These are not Android OS input/lifecycle tests. `F8` captures the actual export Blob for byte inspection and restores through the UI; it does not claim to test the OS file picker.

## Intended D408 UI contract

New fields and controls expected by the regression have stable semantic attributes:

- Feedback form: `[name=category]` with at least `suggestion` and `bug`; old missing category has a compatible default.
- Image preview: `[data-feedback-preview] img`, real decodable original image; individual removal action `personal-feedback-image-remove` with image ID in `data-id`.
- Feedback trash/restore: actions `personal-feedback-trash`, `personal-feedback-restore` with record ID. A local candidate restore is not FeedbackKit's Android DB generation mechanism.
- Existing feedback actions, forms, data ID and original image byte fields stay supported.
- Feedback failed durable save keeps the editor, selected originals and retry context. Restoring the synthetic storage then clicking save in the same page writes exactly one stable record.
- Timer records preserve `data-session-id` and expose mode, outcome and deleted task ID. All existing 25 fixture records remain reachable; a later pagination design should update the test to navigate via actual controls while retaining every assertion and documenting the change.
- Task Ctrl+Enter saves the focused parent form; quick-subtask Ctrl+Enter adds only the child while parent title/notes remain unsaved. Ordinary textarea Enter and IME composition do not submit. Autocomplete normal Enter still selects the suggestion.
- Navigation supports a reasonable x=32 start on all main routes, slow-long and short-fast intentional horizontal movement, without taking editable or horizontally scrollable content gestures. Concrete distance/velocity rules are candidate interaction choices to document, not production protocol changes.

All test data are synthetic. No real user database, remote endpoint, task-sync protocol change, stable signing or production admission is involved.
