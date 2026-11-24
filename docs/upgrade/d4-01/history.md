# D4 候选历史

2026-11-25 Asia/Shanghai。

FACT：CI1 源码 bc9bc28a0359d7b42bdb59e18e7cb0668eca6dcf，Actions 45507711884 failed；Windows Git diff-check 检出上传 intake JSON 的 CRLF 行尾，未进入该平台纯模型测试，也未执行浏览器验收。原始提交、上传 archive 和官方日志保留。下一提交仅规范清单 LF，不将失败改写为通过。

PROPOSAL/候选修正：Demo effective archive 由独立 archiveOwn 与祖先 archiveInherited 计算，批量提交保留原始 own 标记；归档父任务隐藏整树，恢复父任务保留先前独立归档的子任务。继承父任务归档的子项提示先恢复父任务。原树、ID 和成熟字段不变。加入真实 UI 先归档子任务、再归档/恢复父任务、最后恢复子任务的断言。

测试接入修正：工作事项编辑字段限定当前弹窗，避免误填同名页面筛选字段；既有成功断言保持。真实控件验证仍仅 Actions，后续结果另列。
