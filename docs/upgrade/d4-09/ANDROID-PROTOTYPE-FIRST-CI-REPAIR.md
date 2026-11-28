# A409-P10 首轮失败诊断与原型修复

日期：2026-11-28 Asia/Shanghai。修复状态：源码已修改，等待后续 GitHub Actions；不宣称修复版测试通过。

## 已保存的失败

原提交：`57a0438e1fe0e4a5be32eb46ce39f7746f7ed84e`。原 Actions：`46084728532 / attempt 1`。Linux 和 Windows 的 Android 网页原型测试各执行 16 例、通过 15 例；均在 A409-P10 的 `Long note is selectable` 失败，各自本例 runtimeErrors/remoteRequests 为空。这里的 Linux/Windows 指浏览器 runner，不是 Android OS 版本，也不代表原生 APK 测试。

原报告不覆盖、不改状态：

- `work/d4-09/evidence-readbacks/46084728532-a1/android-Linux-report.json`
- `work/d4-09/evidence-readbacks/46084728532-a1/android-Windows-report.json`
- 两份原图/缩略图保存在同目录 `screenshots/Linux/android/` 与 `screenshots/Windows/android/`，文件名 `A409-P10-first-failure.png` / `A409-P10-first-failure-preview.jpg`。

原失败图 SHA256：Linux `59a2d36f9ff6482c8ee91d933b68b8bea5f91f8f47c8afd22f25785a2f11c3db`；Windows `c88345644f668833356109eb247fc729dbfb48a7e07c91f318e1dfdad4fa3b96`。root 已校验官方原 ZIP/logs 的哈希。本次只看 360px 宽缩略图，原图保留。

## 排查顺序与结论

先列出的三个可证伪假设：

1. 合成备注比断言要求短：若成立，即便所有字符均进入 DOM Range，`selection.length > 250` 仍然失败；静态样例长度应小于等于 250，截图可能已经完整高亮。
2. 焦点/重绘清空选区：若成立，应看到空/部分选区，或在异步帧后丢失；需对比 selected 与 textContent，并记录 rangeCount、collapsed 和滚动前后结果。
3. 样式/滚动容器限制选择：若成立，computed userSelect、容器几何或选区正文应显示选择受限、截断/遮挡；需记录实际样式、全文、scroll 和尾段位置。

**确认的首轮失败根因是第 1 项：测试样例与长度要求矛盾。** 从原 Git 对象直接静态读取 `state.note`，将字面量中的 `\n` 转换为换行后，只有 222 个 UTF-16 字符、5 段。原 P10 使用 DOM Range 全选 `.note-paper > div`，再断言选区长度超过 250；完整全选该样例也不可能满足断言。静态分析输入/原文/长度/改后样例已保存为同目录 `android-p10-static-evidence.json`，没有执行原型 JavaScript。

实际观察的 Linux 和 Windows 失败缩略图都显示从“今天核对…”到“末尾应保持可读。”的五段正文完整青色高亮；末段可见，固定头/底部导航没有覆盖这条原始短样例的正文。因此没有证据支持“原型的选区被清空”，也不应声称本轮修好了原生或浏览器选择机制。源码已有 `.note-paper { user-select:text; white-space:pre-wrap; overflow-wrap:anywhere }`，`updateTimerDisplay` 不在 notes 路由重建正文；本次不为凑通过新增强制全选或定时恢复选区的产品逻辑。

首轮报告没有在失败前保存 `selection.length`、实际 computed style 或完整选区对象，不能把静态推导写成已有的运行时字段。下一轮新增观察补齐这部分，区分后续真正的选择/重绘/滚动故障。

## 已修改的原型与回归

`prototypes/d4-09/android.js`：保留原五段内容，增加阅读、编辑和记录核对的三段真实跨屏演示文字，样例为 548 个 UTF-16 字符、8 段。末句仍为“末尾应保持可读。”。内容为合成设计样例，只在页面内存中，没有产品数据读写。

`tests/d4-09/android/prototype-cases.mjs` 的 P10 保留原始 `selection.length > 250` 和时区/秒/毫秒文字断言，保留后半段 dirty 导航取消、Ctrl+Enter 保存与跨页重新读取流程。新增更强证据：

- 在原断言之前记录原文/选区全文与长度、rangeCount、isCollapsed、computed userSelect/whiteSpace/overflowWrap、备注矩形和容器 scroll 几何。
- 选区必须与完整正文逐字符相等，单个非折叠 Range，样式不能为 `user-select:none`。
- 样例正文高度必须超过一整个内容视口；避免以后改成只比 250 稍长却无需跨屏阅读的文字。
- 滚动到正文容器末端后，选区和原文仍逐字符不变、无横溢出，备注最后一段落在未被头/底部导航覆盖的内容视口内。
- 保留 `android-360-notes-dom-selection` 截图，再补 `android-360-notes-dom-selection-tail`。明确仍为 DOM Range 浏览器设计验证，不替代真实触摸长按或 Android WebView 选区验证。

## 同轮发现的任务选择器取消文案

root 看图发现任务选择器底部出现大号 X。HTML 本来包含“取消”文字，但初始化代码对所有 `data-action=close-picker`（包含右上角和底部）统一写入关闭 SVG，把页脚文字覆盖。

修复将关闭图标初始化限定为 `.icon-button`；右上角保留 X，底部保留“取消”，点击处理和关联草稿语义不变。P07 补充页脚文字/无 SVG、右上 SVG 及真实点击取消后对话框关闭、已保存关联和 dirty 状态不变断言。原树展开、同名命中、查询清空恢复和关联保存断言全部保留。

## 验证与剩余工作

本地只做源码/JSON/图片和静态 Git 差异检查：原样例 222 → 新样例 548 字符；相关文件 `git diff --check` 无错误。未在本地执行 Node、浏览器、测试、构建、SQLite、应用或模拟器。

需 root 发布修复提交后，在 GitHub Actions 的 Linux/Windows 浏览器上重跑所有 16 例并审阅 P07/P10 新图与观察值。P10 新增几何断言失败时应保留原证据、定位实际布局，不能删除断言换成通过。首轮 15/16 记录永远保留；第二轮结果必须以自己的 source/run/attempt 标记。

本次没有 Android 原生、共享 `mobile-controls.js`、正式业务逻辑、协议、存储、签名、版本身份、prepare.mjs 或 GROWTH 改动。原生 UI 改造仍等待 root 的开始信号。
