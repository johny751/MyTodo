# D4 候选历史

2026-11-25 Asia/Shanghai。

FACT：CI1 源码 bc9bc28a0359d7b42bdb59e18e7cb0668eca6dcf，Actions 45507711884 failed；Windows Git diff-check 检出上传 intake JSON 的 CRLF 行尾，未进入该平台纯模型测试，也未执行浏览器验收。原始提交、上传 archive 和官方日志保留。下一提交仅规范清单 LF，不将失败改写为通过。

PROPOSAL/候选修正：Demo effective archive 由独立 archiveOwn 与祖先 archiveInherited 计算，批量提交保留原始 own 标记；归档父任务隐藏整树，恢复父任务保留先前独立归档的子任务。继承父任务归档的子项提示先恢复父任务。原树、ID 和成熟字段不变。加入真实 UI 先归档子任务、再归档/恢复父任务、最后恢复子任务的断言。

测试接入修正：工作事项编辑字段限定当前弹窗，避免误填同名页面筛选字段；既有成功断言保持。真实控件验证仍仅 Actions，后续结果另列。

FACT：CI2 源码 8f8f4183c1eaf97a4a361c4108d4ee1bd26789b9，Actions 45509156364 failed。Ubuntu 纯业务测试 16/17，edit-done 参考夹具输入与 Demo 默认开始时间不同；修订为同一显式开始时间，精确相等断言保留，模块语义未改。另改 TAP reporter 以保留结构化测试日志。后续运行待核验。

FACT：CI3 源码 acae31552afde5ad68fbb9ae09de0a97ffd439a7，Actions45511446546 success：Ubuntu/Windows纯业务各17/17，真实DOM30/30，零运行异常、零外部网络请求，离线HTML构建及云端打包通过。视觉QA发现Ubuntu缺少CJK字体，原始截图中文为方框，故该轮不作为可读中文截图验收。原ZIP/截图/日志保留。

PROPOSAL：使用本机已安装、name表明确OFL1.1的未修改Noto Sans SC，SHA763146584cf0710223441356b4395e279021b0806c196614377a7a0174ae074a；只在Actions构建内联data字体，不下载新依赖或新服务。font-src仅允许data，connect仍none。新增明确font加载和身份断言；请求记录省略内联Base64，仅保留类型/长度，避免报告体膨胀。原业务断言保持。下一轮结果仍待验证。

FACT：source intake04在文件大小校验拒绝（换行规范化后清单缓存旧长度），未提交；部分授权文本写入保留在原mytodo-d4-ui detached工作树及d4-publish3.log。修正发布器先全包校验后写入，在mytodo-d4-ui-v2发布source05成功。原Git历史与intake04不删除。
FACT：CI4 source438407793cb7bdb1f780719805e8aa651018b365 / Actions45514411150 failed。格式门禁遇到已封存CI2原日志行尾空白及CI3原Windows启动BAT的CRLF，浏览器未执行。原件不能改写。后续将唯一原件extracted目录标为Git binary diff，同时scope以冻结manifest SHA6d836331b0be1fb395f068446ebeb3f58c8a691404f9dc9d7a808fdfd8328c65和逐文件bytes/SHA-256校验不可变证据；所有可编辑源码格式门禁保留。未减少业务、字体或外部网络断言。