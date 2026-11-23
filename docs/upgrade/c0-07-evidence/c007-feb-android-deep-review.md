# C007 补强夹具运行 Android 独立审查

2026-11-23（Asia/Shanghai）。run `45183273190` / attempt `1` / source `feb0dca3a56ca8cc83d118d1b828b8f69ec768d2`。证据根 `outputs/c0-07/evidence/45183273190/`；主控提供下载归档SHA256 `13eaf83974d4abe282d37e9fa621a1be8aac2203c66d935e989d64cbb2b99186`，本审阅者未重新读取压缩包核验该值。仅本地读取文本/JSON、计算长度/hash及静态比较；没有项目、ADB、SQLite、二进制、构建或测试执行，没有联网。

**Android本轮10场景的55次计划操作均取得对应证据，55次原库重开和3次预设native进程死亡成立；这不改变整轮GitHub failure，也不把collector原始exit1/incomplete改成通过。此源仍是生产修复前基线，不能代替f9或后续源的验收。**

## 计数与原数据库连续性

SQL场景10次，9个网络/ACK场景各5次，共55次，包含10次首步seed。52份普通终态结果中40 accepted=true、12 accepted=false；另3次在指定事务边界死亡，没有伪造普通终态结果。10份summary共652项检查，全部true；suite与各case为passed/exit0。

独立核对55对request/reopen：每case的dbCase、host dbDir与device canonical SQLite路径保持一致；仅首步请求为init，55次重开请求均为mode=resume、operation=audit，未再初始化。110次启动前数据库检查中10个首seed为不存在，余100次为存在。所有命令中没有数据库push/pull/cp/mv/rm/pm-clear动作；重开使用原设备数据库，导出副本只作取证，没有复制副本回放。

110份native前置回执使用110个不同PID，每次重开PID均不同于对应操作PID。52份普通结果after状态与对应重开after逐项比较一致；55份重开before与after逐项一致。比较覆盖meta、实体key/data/record/deleted/conflicts及outbox，保持数组顺序。所有source/case/attempt身份、52个结果hash及55个重开hash与summary一致。

12份accepted=false是计划内错误：8份真实SQLite异常、4份网络失败。Android结果没有faultHits字段，不能把通用计数器的0解读成未执行故障。SQL原文包含trigger1811、deferred-FK787、缺失函数prepare错误和integer overflow；网络原文包含HTTP503或响应流中断。observerExitCode0仅说明观察完成，不取代这些业务拒绝。

## 三次native边界死亡

| 场景 / 操作 | 原PID → 重开PID | 原始边界 | 重开实际状态 |
| --- | --- | --- | --- |
| sql-atomicity / 009-exit-before-commit | 9357 → 9584 | before-real-sqlite-commit | revision5、outbox1/2/3/4；未提交编辑消失，完整状态等于操作前 |
| C007-after-ack-commit-exit / 003-publish-fault | 25134 → 25356 | after-real-ack-return | revision5、pending=null、cursor(c007-A)=1、outbox只余3；ACK已提交，后续事件保留 |
| C007-before-ack-commit-exit / 003-publish-fault | 27137 → 27356 | before-real-sqlite-commit | revision4、pending保留、原cursor、outbox1/2/3；ACK未提交，完整状态等于操作前 |

三份marker原文件均与before/summary/process的source、case、attempt、dbCase、native PID及canonical databaseFile一致。两个COMMIT前marker含inTransaction=true、transactionSuccessfulMarked=true，uncommitted revision为前值+1且数据确已改变；ACK前marker的完整暂存状态与删除through<=2、推进cursor、清pending、revision+1的预测一致。三个重开状态均按各自提交边界独立比较通过。

三次ADB instrument命令本身exit0且正常结束；其原stdout均是`INSTRUMENTATION_RESULT: shortMsg=Process crashed.`和`INSTRUMENTATION_CODE: 0`。这是预设死亡的instrumentation表现，不能写成普通测试成功。每个marker之后的natural-exit pidof原命令返回code1，stdout/stderr都0字节，原PID不存在；再次after-confirmed-natural-exit探测也为空。naturalExit确认发生在导出前，三个死亡分支没有after-stop命令，因此不存在用force-stop替代预设自然结束的证据。

系统exit-info另记录这三个原PID为reason2 SIGNALED/status9，时间分别为13:37:52.645、13:42:12.194、13:42:43.739 UTC，与native kill和marker链相容。Android进程被SIGKILL；86是宿主测试worker对已确认边界的协议退出码，不能混为Android操作系统退出码86。

marker文件SHA256：SQL前`30cb08bd0f6d7900c020f4fcc53358ff36ef4eedee71a0e0f7cf0f0b95c89b1f`；ACK后`ad364ce00780fe5ec9f42777badf96b809c6bdaa5b993fe1f505adef7a71e790`；ACK前`9237726f6d063d508c858d3ec8eeb5d1e56a10c7bc41199f2cc6b35d32e57c63`。

## SQLite导出、边车及collector原始失败

110份操作/重开Android process收据各描述4个文件，共440项：110主库、3 WAL、3 SHM保全，324项有效missing（107 WAL、107 SHM、110 journal）。两次COMMIT前死亡的WAL为0字节但存在；ACK后死亡WAL为8272字节，三个SHM均32768字节，不能把0字节WAL说成缺失。

116个保全文件的remote-before、transfer、remote-after、长度/hash、sourceStable、transferMatchesRemote及localReadbackVerified互相一致；110主库均记录SQLite头验证通过。已独立读取232份available原probe和324份missing原probe，内容与parsed收据一致。116个宿主pre/post重开副本的files.json及云端库存hash/长度也逐一对应导出收据。这里只读验证文本与库存；数据库和边车实际字节仍在云端，没有本地开库、恢复或重算其内容。停进程后的逐文件导出不是断电时原子快照，不声称断电耐久性测试。

collector原始`collectionExitCode=1`、`evidenceComplete=false`，114条failure全部严格为`binary-in-text-evidence-path`：110个主库export stdout、1个非空WAL stdout、3个SHM stdout。路径只属于数据库导出命令，hash与其真实导出文件hash一致。另2个空WAL stdout可作为空文本，故错误数114并不等于保全文件数116。没有其他failure类别。保留这114条原始失败及原包，不把解释写成collector通过。

## 意外退出资格

110份crash-log stdout/stderr均为空。110份exit-info有1704项重复历史记录，去重为220项：107个主进程FORCE STOP、3个上述预设SIGNALED、100个WebView OTHER KILLS/ISOLATED NOT NEEDED、10个WebView EXIT_SELF/ISOLATED NOT NEEDED。110个主退出PID集合与110个native回执PID精确相同，没有额外/缺失主PID；三个SIGNALED PID精确等于预设死亡PID。

本运行已观察记录未出现额外主进程CRASH、ANR、DEPENDENCY DIED或FontsProvider崩溃。该结论限本次模拟器及已收集历史，不能据此关闭C006稳定性issue #1，更不清除历史首崩/新库retry资格。

## 来源、环境与完整性

source、build metadata、prepare、suite、各native回执及seal均绑定feb源；seal为sealed/sourceUnchanged=true仅是封存资格。入口hash为`26c6fe1af4acde956accd5d2146548dd4fa75d623a77437075fcf34f1ddeab7a`，worker为`75aad784da7b53d991fff2ef22cb74bf0db1a40cb9d1f16f0f4f1028f498ef34`，与已审窄修复一致。Android ReplicaDatabase、Node store及Windows database的源hash与4a8首轮相同，证明本轮不是f9生产修复验证。

环境ready/exit0、收尾finished/exit0；Ubuntu24 X64 image20261116.376.1，emulator37.3.10.0、API34 google_apis x86_64 revision14，WebView113.0.5672.136。此次native回执直接取得framework SQLite3.39.2，非用Node或shell版本替代。设备fingerprint为`google/sdk_gphone64_x86_64/emu64xa:14/UE1A.230829.050/12077443:userdebug/dev-keys`。

测试APK167011B，SHA256 `5b6cb1c87e707a24e447dab9cc6529d2afb167babca07c0fa381a7f8ebad43ae`，build输出、prepare、110份worker及cloud库存一致。仅云端库存hash比较，没有本地读取APK；非正式发布/升级包。

本次独立校验8984个Android/环境本地文本长度/hash，全部一致；Android9385及环境41个producer条目共9426项与collector库存一致。3822条命令的7644个stdout/stderr hash全部匹配：7530份本地文本实算，114份二进制stdout仅云端清单比较。主控所述全平台12114 producer rows仍以原collector记录为全范围结论，本审阅者的逐项深核限Android/环境。

关键文件相对Android artifact的SHA256：suite/suite.json `9ef89242f91b59946910a6b37bff6e9695adc45cdee180130ac2a9f2678975df`；source.json `c4a1b34e6a43258e381ebd6ca1e4b35a5019269d9302388b2ec0ec0fe0d19380`；seal.json `c239daa77d46f107b9dd81cee96819bc2b73dc3557ca3a96123d35eb65f796a0`；build/build-receipt.json `77def67f210e8c17d9f209f35001f9af05912f057c1f5a8601a0d96cb71db6a7`；prepared.json.receipt.json `3ee9d3ce9ddc51a93500b6f02ecfe8346e71209034fc7cfbf4e5795565078b81`。
