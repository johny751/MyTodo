# MyTodo 阶段 0 源码审计与项目基线

2026-11-23，Asia/Shanghai。**真实源码静态审计已完成；原版本三端 GitHub 云端构建及现有自测基线通过，四个 job Success、真实收据和payload重算哈希已归档；阶段 0 整体仍未通过，三端生产存储互操作及 C0 兼容性前置任务待完成。** 本轮记录见 [12 云端基线](12-cloud-baseline-20261123.md)。

## 基线与来源

- 仓库：johny751/MyTodo；业务源码分支 master。用户说明默认 main 没有业务代码，审计没有改默认分支。
- 经用户现有 Edge 登录会话读取了私有仓库 master 页面，并进入其 Codespaces，看见 README 和实际目录。
- GitHub master 下载 ZIP 注释提交：`5480c88c806cf1c366ec998b0ba627543d63233a`；页面短提交为5480c88，两者匹配。
- 原ZIP 46,826,549字节，SHA256：`d05a6371b4eff1e72884c1cc75f525a0344afd0429318fd8355522c66b13a97c`。
- 完整归档313个文件，记录所有路径/字节/SHA256/Git blob SHA1；只为审计解出302个源码/文档文件，16,875,736字节，11个既有EXE/APK/发布ZIP未解出。
- ZIP不含.git，不能据此提供Git状态。本轮另在Codespaces实际执行`git status --porcelain=v1 --branch --untracked-files=all`、`git rev-parse HEAD`和`command -v gh`：master提交前预检HEAD为`5480c88c806cf1c366ec998b0ba627543d63233a`，工作区干净、跟踪origin/master，gh为`/usr/bin/gh`。当前聊天目录本身不是Git仓库；没有伪造Git初始化或替代项目。
- 所有应用源码保持归档原字节；本轮将审计/规范文档与 CI 定义/执行器分开提交到 master。没有数据库迁移、业务功能或同步协议修改。文档提交为 `4c2edfc833d2c14146c9f9cdd3bf9c9b51de1f31`，CI 提交为 `06a269b965c0c92c0e818effba5546986dd3242d`。

完整结构与身份见 `evidence/source-snapshot-manifest.json`、`evidence/source-tree.txt`。清理本轮临时源码、下载ZIP和早期工具探针目录的命令被自动审批拒绝（blocked by policy，没有进一步理由），命令未启动，文件仍保留。没有换工具绕过拒绝；本机扫描和清理证据只留在本地交付附件，不提交仓库。

## 实際架构与当前版本

| 部分 | 实际实现 |
|---|---|
| Windows | C/Win32/GDI，SQLite+cJSON+zlib；原构建是MSVC/Windows SDK，并非Qt/CMake/MinGW工程 |
| Android | Java原生壳+WebView，共享JS业务；手工aapt2→javac17→D8→jar→zipalign→apksigner，没有Gradle/wrapper |
| Web | 正式运行版已存在，HTML/CSS/原生ES模块+本机Node HTTP/SQLite；不是只有Demo，也不是独立静态/PWA应用 |
| 数据 | 三端基础meta/entities/outbox；五类复制实体以JSON保存；Windows另有派生搜索表 |
| 同步 | 既有WebDAV v2：C实现与共享JS实现；Android Java提供SQLite/HTTPS/凭据桥 |
| 源码版本 | package.json 0.9.2；Android Manifest 0.9.2/versionCode15；本轮沿用原版本生成 unsigned 编译基线，未发布新的正式签名版本 |

## 已有功能与保留方向

成熟基础包括四象限、任务/多层子任务、便签、重复、提醒、分类、搜索、统计、多本地账号、业务备份和WebDAV增量同步。项目已有轻量分类及任务比例，不具备完整阶段/成员/成果管理。番茄钟、计时通知、悬浮球、小组件是Android原生能力，Windows/Web没有对应完整实现。

模板/版本/流程实例、往来跟踪、通用附件档案、LAN发现和设备配对须增量新增。保留现有三端栈及同步v2；不整体换框架或重建空数据库。

## 关键问题与影响

1. 单账号meta只有一套scope/epoch/pending，outbox ACK会清全局队列；直接加LAN ACK会损失尚未发布到WebDAV的投递义务。需先设计按目标投递/确认账本。
2. C/JS冲突排序及输入校验不一致；C旧云迁移和fence恢复与JS不等价。需真实跨实现向量，不只测JS模型。
3. Node helper的新gx-dpapi-v1:UTF8格式缺少C反向读取兼容；同目录混用需要合成凭据互读测试。
4. 当前没有编号schema迁移。C/Node的位置INSERT给entities加列即不兼容，必须先转明确列名，建立一致备份/恢复/迁移登记。
5. Windows最小v1子任务导入、损坏账号清单、逾期统计与共享JS有静态差异；需要云端重现后独立修复。
6. 新实体被现有kind/字段白名单拒绝或丢弃。新增业务必须联合改模型、存储、导入导出和协议能力边界。

上述为代码差异/风险，不是已发生生产数据丢失的结论。详细证据见02/03/04/06。

## 实际执行边界

本轮读过README、完整文件索引、三端业务入口、数据库/同步/构建/测试源码。历史README报告的通过数字属于历史，不算本轮结果。早期子Agent做过一个无文件、无网络的本地JS内存排序/校验探针；该探针没有C互操作、仓库测试套件、编译、安装或真实同步，不能替代后续云端记录。

用户最新明确所有编译、测试、打包在GitHub。本轮之后没有本地构建或仓库测试。已通过 Codex 内置浏览器在授权 Codespaces 提交工作流，master push 触发 [Actions run 45101481375](https://github.com/johny751/MyTodo/actions/runs/45101481375)，attempt 1，源码 SHA 固定为 `06a269b965c0c92c0e818effba5546986dd3242d`。Freeze source SHA、Windows 原生构建和自测、Web/共享 JS、Android unsigned/Java 四个 job 均显示 Success；逐项退出码、工具与产物哈希按本轮收据归档，见12。

GitHub插件对私有仓库/明确master的404及早期浏览器输入故障属于访问阶段历史。本轮程序恢复后，内置浏览器已成功完成文件上传及 Codespaces 操作。首次云端 rename 遇到 `/workspaces` 与 `/tmp` 跨文件系统错误，仅修正了传输方式；`gh run list --workflow` 因默认 main 没有定义而返回404/退出1，随后按 run ID 的 API 查询确认实际运行成功。这两项失败保留，不改写为初次成功。

## 交付及后续门槛

01架构、02数据库、03同步、04功能、05执行基线、06风险；07正式规范、08文件级任务、09第一阶段方案、10三端CI、11验收状态已随文档提交进入 MyTodo master。12补录本次云端基线和原始证据索引。

本轮云端基线证据已核完。后续顺序：配置C0相关云端触发入口→C0-03三端生产存储共同协议向量→C0-04排序/校验、C0-05凭据互读、C0-06旧云恢复、C0-07 SQL错误传播分别独立提交和云测→D1数据备份与编号迁移→工作台/项目/往来/档案→模板流程→安全LAN与双通道→三端完善→T01–T16及签名发布。基线成功不解除后续兼容门槛，本轮不进入D1或大规模业务开发。
