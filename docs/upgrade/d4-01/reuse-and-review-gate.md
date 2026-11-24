# 成熟功能复用与 UI 审核边界

2026-11-25 Asia/Shanghai。

FACT（静态源码）：既有 Windows 保留原生 C 界面；既有 Android WebView 装载 bundled Web 资产并通过受限 bridge 存储；既有 Web 使用成熟 task model/editor/schedule。B 候选不替换启动入口、bundled 资产或原生窗口，不改 src/windows/android。原应用的任务、笔记、提醒、计时等成熟功能继续保留在原应用。本 Demo 用于新工作管理页面与统一导航评审，不能宣称已接入全部原生成熟功能。

PROPOSAL：原生集成以添加工作模块与适配现有组件为主。Windows 保留原生四象限颜色、侧导航与详情堆栈；Android/Web 保留同一任务字段、时间规则和操作结果。未批准的 D2 迁移实现不会从 UI 启动或跨线合并。

OWNER DECISION：按负责人提供的 UI 流程“网页版 Demo → 确认 UI 定稿 → 最终平台代码”，本次在可体验 D4-01/D4-02 候选与统一证据处等待界面评审。后续 D4-05 原生集成需先完成该定稿点。

UNVERIFIED：Windows 原生新页面集成、Android 真机适配、现有计时/笔记与新导航的完整回归、真实三端存储接口接入。响应式截图不等于 Android APK 或原生应用验证通过。

BLOCKER：真实数据与同步准入继续受 A 线安全门禁约束。无真实数据库、真实 LAN/WebDAV、双通道、远端凭据或生产 ACK/outbox/cursor/manifest/batch 语义授权。
