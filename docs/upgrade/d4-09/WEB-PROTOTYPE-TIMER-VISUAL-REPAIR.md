# Web prototype timer header visual repair

2026-11-28, Asia/Shanghai. This change is limited to the memory-only design prototype and its D409 prototype tests; actual shared product source remains pending the root screenshot gate.

Root and Web agent visually inspected official Actions `46086386919/attempt1`, source `f5ed3044e31a3d4aeecb7c9745587892e9292dd4`, Linux screenshot `W409-P10-web-desktop-timer-paused-history.png`. The original is 1440×960, SHA256 `f3cca601501aaa55adda83a8f1f4c313106c43e3a0dffcb947aaf651f380068f`; the inspected 960×640 preview is SHA256 `4aabc2f0f1b9b4dd74044b23aebe6bdcf8deaf9c6e66649c9ac9553f6e930c27` (original/preview scale X/Y=1.5). Retained archive/member paths are recorded in `work/d4-09/evidence-readbacks/46086386919-a1/screenshots/Linux/web/W409-P10-web-desktop-timer-paused-history.image-receipt.json` outside source.

Observed defect: the right panel heading “专注记录” occupies four vertical lines. The generic `select {width:100%}` combines with flex header and shrinkable `h2 {flex:1}`, assigning nearly all width to the history filter. The original functional P10 checks timer behavior and history counts; its pass does not establish readable heading geometry.

Repair in `prototypes/d4-09/web.css`: keep this timer header title on one line with nonshrinking intrinsic minimum, and constrain its history filter to a useful 160px flex basis (maximum180px). The scope is the timer panel header only; no timer state, service, storage or event behavior changes. Existing mobile padding and column breakpoints remain.

Additive P10 assertions in `tests/d4-09/web/prototype-cases.mjs` record header/title/select rectangles and text-line rectangles at1440,1024,360,412 CSS px. They require one title line, title height within one line-height, selector width100–180px, at least10px separation and no right-edge escape. New screenshots retain the same original desktop paused-history image and add each width's timer header image. Existing timer start/navigation/pause/resume/early-end/history assertions remain.

No local browser/JavaScript/test/build was executed. Next exact-source hosted run must establish geometry and new screenshots on both OS; this source repair is not declared visually passed in advance. Preserve the original passed-functional-but-visually-defective report and screenshot in the history.
