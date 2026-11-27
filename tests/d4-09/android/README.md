# Android 浏览器原型云端回归

`prototype-cases.mjs` 导出16个独立case，每个case由root的Actions harness新建context并载入 `prototypes/d4-09/android.html`。导入Node内置assert，无第三方新增测试依赖。本地只写源码和静态检查；尚未运行，不声明通过。

Harness约定：`eval(expr)`、`until(expr,message,timeout)`、`configure(width,height,mobile)`、真实CDP鼠标`click(selector)`、DOM input/change的`fill(selector,value)`、`key(selector,key,modifiers)`（Ctrl=2）、`screenshot(label)`、`settle()`、CDP touch `swipe(from,to,{duration})`、`observe(value)`。

点击helper先检查唯一selector，通过DOM scrollIntoView把目标滚入视口，再由harness发真实CDP点击。文本输入按harness定义走DOMinput/change，不称Android IME键入。备注选区用DOM Range，记录为DOM选区设计证据；back用原型显式JS API，记录为原型历史逻辑；触摸用浏览器CDP，不能当Android系统手势/三键/Back证明。

| ID | 独立目标 |
|---|---|
| A409-P01 | 412宽全部12route、抽屉、Esc焦点、未知人工状态 |
| A409-P02 | 360宽主要页面几何/无横溢出/48CSS像素目标 |
| A409-P03 | 页面菜单Esc、新建任务dirty继续/创建 |
| A409-P04 | 任务query/filter跨页保留、同名ID、象限移动与删除取消 |
| A409-P05 | 倒计时idle/running/pause/resume、结束取消与历史 |
| A409-P06 | 正计时完成、休息、重置保留记录/统计口径 |
| A409-P07 | 父子/第三层展开、同名关键词及祖先链、空态、待保存关联 |
| A409-P08 | 分钟校验、dirty继续/丢弃/保存并离开 |
| A409-P09 | 明示演示失败、禁用写入、一次重试/一条会话历史 |
| A409-P10 | 360宽完整长备注/DOM选区、草稿保留/Ctrl+Enter |
| A409-P11 | 工作事项长详情、独立实例/步骤、创建独立合成实例 |
| A409-P12 | 合成SVG加载/预览、删除取消/确认、空内容纠正 |
| A409-P13 | 反馈快照丢弃恢复、明确标记的备份/恢复/坏包状态 |
| A409-P14 | 加载/空/错误后保留草稿、非APK版本/离线历史 |
| A409-P15 | 浏览器原型Back关闭最上层、历史不循环 |
| A409-P16 | 浏览器左缘长横滑模拟、编辑框排除/草稿保留 |

截图包含360/412番茄idle、running、paused、countup、break、未确认，任务层级/同名搜索，抽屉、工作台、工作事项/实例、备注DOM选区、反馈图片/删除确认/错误、版本历史。原图/缩略图/映射由root的Actions收集及交付流程统一处理。

编写用例时静态审阅发现并修正仅浏览器原型的返回历史：返回旧页不再将离开页压回历史，避免循环；dirty取消仍保留原历史。没有改正式Android、shared mobile-controls.js、原D4-08测试、存储、计时内核、服务或FeedbackKit。

所有成功仍仅限原型设计：不声称生产数据、真实磁盘失败、幂等回执落盘、PhotoPicker/SAF、后台服务、原生通知、实体机、签名覆盖或生产准入已证明。联系人、跟进、归档没有被升级为人工通过。
