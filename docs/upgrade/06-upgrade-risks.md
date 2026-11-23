# 升级风险及修复门槛

2026-11-23，Asia/Shanghai；基线master 5480c88。下表区分当前实现差异与新需求缺口，均没有生产损失事故结论。

| 优先级/性质 | 源码依据 | 影响与必须验证 |
|---|---|---|
| P1 新需求缺口：双通道确认 | meta单scope/pending；sqlite-store:26、ReplicaDatabase:34、sync.c:23全局ACK | LAN确认不得删除WebDAV/其他对端投递义务；按目标账本、统一批次去重、会话锁和崩溃恢复先于LAN上线 |
| P1 当前协议差异 | replica.mjs:39–44 vs database.c:13/14；sync.c:16/21/22/24 | actor比较、key/context类型、ID长度、安全整数/游标范围需统一；云端C/JS实际双向向量 |
| P1 当前凭据兼容差异 | sync-server:8/13、credential-helper:24/35–38 vs sync.c:5/6 | Node新UTF8前缀格式C不识别；合成配置互读与失败不覆盖，不测试真实凭据 |
| P1 当前旧云迁移差异 | delta-sync:20–37 vs sync.c:25 | v1备份/fence/manifest缺失中断恢复；保留安全拒绝，不能初始化空云覆盖旧记录 |
| P1 数据升级基础缺口 | database.c:10/33、sqlite-store:8/13；无编号迁移 | 位置INSERT加列会破坏写入；先列名，再三端一致备份、迁移登记、故障恢复 |
| P1 当前兼容风险 | database.c:29–30；gui.c:259；account-store:25、AccountStore:21 | 旧子任务、非任务ID冲突、坏账号清单须云端夹具验证，不静默跳过/重建覆盖 |
| P1 错误传播风险 | database.c:8/9，sync.c:18/22 | SQL失败与空结果需区分；故障注入证明不会半提交/提前游标或丢outbox |
| P1 新模型扩展缺口 | 五kind白名单及model normalizer | 新字段/实体需完整round-trip和旧客户端失败门槛，不能只加数据库表/按钮 |
| P1 新LAN安全缺口 | 当前只有本机HTTP与WebDAV HTTPS | 新服务要配对/TLS/身份/撤销/限次/接口绑定；不能把server改0.0.0.0当安全LAN |
| P2 当前统计差异 | dashboard.c:3 vs schedule.mjs:30 | Windows逾期用start、JS用end或start，需明确共同规则及带起止时间fixture |
| P2 静态性能风险 | MainActivity:129–135、158–165 | 共用无界单线程executor、UI回调大文件IO；实际云/设备测量后修，不宣称已实测卡顿 |
| P1 发布环境缺口 | build-android:10–16/60–69；package-release:21–29/42 | 精确SDK35/API34、原签名、官方Node24/runtime/hash/license；unsigned与Web源码包不能冒充正式三包 |
| P2 验证基础缺口 | 现有测试主要JS/mock及原生自测 | 尚无本轮云基线、C/JS互操作、真实Android桥接/LAN/附件验证；历史数字不顶替当前测试 |

保留Windows C/Win32、Android Java+WebView、Node/原生JS及WebDAV v2。当前没有证据支持大规模换栈；新增模块按08/09小步实施，公共接口由主Agent统一。

当前访问风险：GitHub插件404与浏览器输入故障阻止CI提交/运行；私有仓库在用户浏览器已可读，不再把“找不到源码”作为当前阻碍。默认main没有业务代码，本次源分支固定master。真实Git工作区状态仍需云端记录。

迁移和测试仅云端隔离夹具；真实数据库不处理。任何新依赖下载/新外部服务要按项目范围处理，当前CI只用runner预装组件。
