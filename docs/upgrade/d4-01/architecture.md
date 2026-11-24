# D4-01 / D4-02 并行产品候选

2026-11-25 Asia/Shanghai。B 线从 master 建独立 d4/ui-candidate-1；不引入 D2 候选生产迁移。

## 可体验范围

PROPOSAL：11 页统一导航、四象限颜色和详情抽屉，Windows 直接打开单文件 HTML；Android/Web 使用相同响应式原型。完成界面确认后才进入原生 D4-05 接入。

FACT（源码）：任务结构沿用冻结 master 的 V2 模型，done、start/end 北京时间字符串、project 名称、嵌套 subtasks；复用 model、schedule、task-tree、task-editor、personal-ui 与 sync-core 的纯内存函数。未加载生产 storage、sync-client、accounts、replica，也不启动任何 Actor/outbox 或网络服务。

FACT（候选实现）：独立 repository 使用 mytodo-d4-01-demo-v1，内容带 synthetic kind 标记。项目 ID、工作事项关联、归档任务和工作模块放在独立 demo 扩展。composite 仅供原型展现，写回时 core 由成熟 normalizeState 校验，扩展独立保存。循环生成任务和子任务的演示关系单独物化，禁止写入生产字段。

## 行为与核验

PROPOSAL：工作台、任务 CRUD、子任务、循环、提醒中心、搜索过滤、项目及事项 CRUD/关联、模板/实例运行、往来跟进、归档恢复、统计、设置偏好和合成导出。提醒仅显示应用内计划；无原生后台通知能力声明。

验证通过状态只依据 Actions 的 domain TAP、browser-results.json、build-receipt.json 和源 SHA/run/attempt 一致性。Windows 与 Ubuntu 运行纯业务测试；Ubuntu 已有 Chrome 执行 DOM 表单/按钮，覆盖 11 页和工作模块，并保存桌面/手机截图。构建无 npm 下载、无公共托管；CSP 禁外部连接，测试层同时阻断 HTTP/WebSocket 请求并断言无页面外部请求。

UNVERIFIED：真实三端存储接入、原生 GUI 生命周期、原生通知、真实数据兼容、生产同步/迁移和设备体验。上述不得用合成浏览器验证替代。

OWNER DECISION：首批原型的导航、密度、四色、详情编辑、工作域交互定稿；后续 Windows 原生集成范围。

BLOCKER：A 线真实 schema、只读预检、全部 writer 屏障、正式构建身份、备份恢复多文件持久化、远端认证、Android issue #1 均继续按独立准入审核；不阻塞 B 原型，不降低生产要求。

## 阶段证据

源代码不含真实用户数据库、账户凭据或真实地址。所有运行/测试/可执行打包在 GitHub Actions。失败历史完整保留；成功验证链接、产物 SHA 清单与 Compare 结果由最终报告记录，不预填通过结论。
