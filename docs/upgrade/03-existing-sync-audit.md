# 现有同步系统源码审计

日期：2026-11-23，Asia/Shanghai。基线为 `master` 源码ZIP，提交注释 `5480c88c806cf1c366ec998b0ba627543d63233a`；ZIP SHA256为 `d05a6371b4eff1e72884c1cc75f525a0344afd0429318fd8355522c66b13a97c`。来源及完整文件索引见本任务 `evidence/source-snapshot-manifest.json`。源码快照不含Git历史。

本报告已完成同步路径静态审计，不宣称本轮Windows/Android/真实坚果云互操作通过。业务代码和协议未修改。下文“正式同步规范”是已决定的后续实现约束，不是当前代码已具备的机制；开发顺序及证据门槛同时遵守 `07-development-standards.md`、`08-development-task-gates.md` 和 `09-phase-one-entry-plan.md`。

## 实际调用路径

网页：`src/app.mjs:47 runSync` → `src/sync-client.mjs:9 exchange` → `src/delta-sync.mjs:119 syncDelta`。数据库调用经 `/api/sync`（`server.mjs:51`）→ `src/account-store.mjs:66` → `src/sqlite-store.mjs:15`；网络调用经 `src/sync-server.mjs:19` 代理坚果云。

Android使用同一 `sync-client.mjs`、`delta-sync.mjs` 和 `replica.mjs`。`MainActivity.java:129` 的JS桥把工作放入单线程Executor，`AccountStore.java:48`把replica操作交给 `ReplicaDatabase.java:23`，网络交给 `SyncStore.java:33`。Java没有另写一套增量合并算法。

Windows原生由 `windows/main.c:2 --sync` 调用 `windows/sync.c:31 sync_run`，独立用C实现同一v2 wire格式，WinHTTP负责HTTPS，`windows/database.c:23/24`负责本地和远端事务。

`src/sync-core.mjs`仍保留v1整份文件合并/`syncExchange`，用于旧云文件迁移合并和历史测试；当前正常页面入口是v2 `syncDelta`，不能把v1的“冲突副本”行为当成v2字段冲突处理。

## 已确认存在的机制

| 机制 | 源码证据及实际语义 |
|---|---|
| 独立身份 | `replica.mjs:9`、`sqlite-store.mjs:9`、`ReplicaDatabase.java:17`及C初始化：每个账号数据库副本随机actor；不是每机器唯一硬件身份 |
| 实体与事件 | `replica.mjs:7/40`：key为JSON `[kind,id]`，事件有actor、seq、clock、context、values；kinds固定为tasks/notes/projects/tags/places |
| 因果合并/冲突 | `replica.mjs:46/54`、`database.c:15/18`：不同字段分别合并，并发同字段版本保留；选择冲突形成新事件 |
| 墓碑 | `replica.mjs:35/58`、`database.c:19`：删除以 `_deleted=true` 保留版本，优先于并发旧副本自动复活 |
| 本地事务/outbox | `sqlite-store.mjs:23-29`、`ReplicaDatabase.java:31-36`、`database.c:23`：业务行、事件、序号/outbox同事务；JS有revision比较并交换 |
| 接收事务/防循环 | `replica.mjs:81`、`database.c:24`：合并行、vector、clock与该来源游标同事务；远端事件不重新入outbox |
| manifest/epoch | `delta-sync.mjs:9/20`、`sync.c:16/25`：`v2/manifest.json`，gxtodo-delta/version2/epoch/heads/snapshot |
| 不可变批次/ETag | `delta-sync.mjs:15/69`、`sync.c:17/24`：`b-<actor>-<index>.json.gz`首次PUT用If-None-Match:*；同名412时完整body一致才继续；manifest强ETag条件写 |
| pending/可靠确认 | `delta-sync.mjs:59/69`、`sync.c:22-24`：本地保存确定body/path/index/through；manifest成功发布或已含该批次后才ACK |
| 独立来源进度 | `delta-sync.mjs:49`、`sync.c:21`：各actor连续cursors；缺中间批次时失败而不跳过 |
| gzip/限额 | `sync-server.mjs:20/23`、`SyncStore.java:67/68`、`sync.c:12/13/15`：gzip收发，展开上限8MiB；Node/Android部分文案仍写5MB |
| 快照/恢复 | `delta-sync.mjs:41/86`、`sync.c:19/28/29`：分片SHA256和epoch/id校验，记录含字段版本/墓碑；全部片成功后推进快照游标，ETag发布；历史云批次/快照不自动清理 |
| 会话互斥 | `delta-sync.mjs:119-129`、`sync.c:14/31/32`：meta.lease随机token，约120秒过期，接近到期续租，可崩溃接续 |
| 调度/离线 | `app.mjs:37-53`：前台且联网时同步；编辑约15秒，受撤销窗口影响；空闲约5分钟，失败退避最长约30分钟；每阶段最多12批且有more状态 |
| 凭据/HTTPS | `sync-server.mjs:8/13/16`、`SyncStore.java:26/64`、`sync.c:5/6/15`：Windows DPAPI，Android Keystore AES-GCM，其他Node平台为本地AES-GCM/key文件；坚果云HTTPS、不跟随重定向；没有业务数据端到端加密 |

快照逐片应用事务，只有所有片成功才推进快照cursors；中断后重读已应用片，依靠事件幂等恢复。附件独立传输、内容hash/断点/原子发布没有在上述同步路径实现；网络路径限制为state.json/v2文件。

## 跨实现问题与差距

### 1. 冲突优先值比较规则不同

JS `replica.mjs:39`使用 `actor.localeCompare`，C `database.c:14`使用 `strcmp`。当前验证器允许混合大小写actor，这两种排序对A/a不同，可导致相同并发字段在两端显示不同优先值，虽然两端均保留冲突。默认UUID通常全小写降低出现概率，但不能替代协议约束。

本子任务在收到主Agent转达的云端执行约束前，用现有Node v24.22.3调用生产applyEvent/rowFromRecord做过无网络、无文件写入的本地内存探针：相同clock=seq=1、context={}的actor A/a事件，结果顺序 `["a","A"]`、winner=`A`、1处冲突，exit0。C按ASCII会选a是静态推导，**没有执行C互操作测试**。需统一比较规范并用同组C/JS向量验收，不只改一端。

### 2. 事件和manifest校验边界不同

- JS `replica.mjs:41`只解构key前两项，未要求数组恰好两项；C `database.c:13`要求恰好两项。
- JS `replica.mjs:42`未要求context为对象，truthy数值context可通过；C要求JSON object。
- JS id上限200个UTF-16 code unit，C上限800个UTF-8字节。300位ASCII id在JS被拒绝，在C长度规则下允许。
- JS manifest heads使用Number.isSafeInteger、actor长度1–80；C `sync.c:16`未限制安全整数上限/空actor，`sync.c:21/22/24`又将批次cursor/index/head转成32位int。

同一前述本地JS探针实测接受三项key数组和context=2，拒绝300位ASCII id；C结果只由源码规则核对，未执行。后续新增输入及互操作测试只在GitHub执行，无效批次必须保持事务和游标不变。

### 3. C首轮旧云迁移只部分支持

JS `delta-sync.mjs:20-37 ensureManifest`可备份v1 state.json、条件写升级fence、合并备份再创建manifest。C `sync.c:25 create_manifest`遇旧v1直接要求先用0.8.1同步；遇已fence而manifest缺失，也不加载guard.backup。安全拒绝值得保留，但需补齐恢复/迁移入口或清晰限制，不能把旧云数据静默初始化为空。

### 4. C/Node共用目录的凭据格式只有单向兼容

两者都使用 `sync-config.enc`。C `sync.c:5/6`只读写无前缀十六进制DPAPI blob，明文按UTF-16处理。Node `sync-server.mjs:8/13`在助手可用时写 `gx-dpapi-v1:` 前缀；`windows/credential-helper.c:24/35-38`保护UTF-8明文并输出十六进制，Node有读取C旧UTF-16格式的legacy分支，C没有读取新前缀/UTF-8格式的分支。

因此Node helper写入同名配置后，原生C会在前缀十六进制解析时失败。这是静态确认，未用真实程序复现。`tests/web-launcher.test.mjs:63`只验证Node helper新/旧格式，不验证原生C反向读取。需云端Windows合成凭据双向测试及格式兼容，不使用真实密码。

### 5. C SQL失败传播需故障注入

`database.c:8/9`的db_page/db_outbox未区分SQL准备/步进失败与空结果；`sync.c:18 bind`重建outbox时有未检查返回值的sqlite调用；`sync.c:22 prepare`部分事务失败也未统一设置Sync失败。具体运行影响未验证，不能写成已发生数据丢失；应对这些入口添加明确错误传播及磁盘/损坏/事务故障回归。

## 双通道升级影响与正式同步规范

当前按**单个逻辑云空间**设计：一个账号meta只有一组scope/epoch/pending/cachedManifest，cursors按来源actor记录，没有每个对端设备的投递确认。`sqlite-store.mjs:26`、`ReplicaDatabase.java:34`、`sync.c:23`在ACK时物理删除全局 `outbox id<=through`。

这适合“可靠发布到共同WebDAV空间后其他设备继续拉取”。若LAN对端确认直接调用现有ACK，尚未发到WebDAV的事件可能失去待投递记录；若把LAN当不同scope切换，`delta-sync.mjs:39 bind`/`sync.c:18`会清pending/cursors并重建outbox。故现版本不满足LAN+WebDAV并行及各对端独立确认；这是新需求差距，不代表现有单通道必然失效。

以下行为已经确定，公共 DDL、接口和新旧 wire 映射在实现前由主Agent内部审核，不再次询问已确认需求。保留既有事件、字段合并、墓碑、`meta/entities/outbox` 和数据库事务核心，逐步增加逻辑批次、目标投递、接收收据与恢复状态。不能只把当前全局ACK改名后复用于LAN。

### 1. 一个逻辑批次、多个目标义务

- 同一批事件只有一个稳定的逻辑 `batchId`，在任何通道发送前持久化。批次内容、所属逻辑空间、来源副本、事件身份/范围和内容校验值冻结后不可变；重试、换通道、重启均复用该身份。事件身份仍是原 `actor + seq`，不能为LAN/WebDAV分别生成业务事件或另造两份互不关联的outbox。
- `batchId` 与传输文件名、WebDAV actor/index、gzip字节表示和连接session分离。保留现有v2不可变文件与ETag流程，以持久映射把逻辑批次关联到原WebDAV文件；具体新旧映射须通过向量验证，不重写历史云批次或擅自改wire format。相同 `batchId` 携带不同逻辑内容属于协议错误，不是可覆盖更新。
- 批次冻结与所需目标集合登记在同一发送端数据库事务完成。每个目标有稳定 `targetId`、目标类型、逻辑空间/账号边界及独立持久投递状态；LAN配对设备的目标与共同WebDAV空间目标分别登记。actor是账号数据库副本身份，不能直接当硬件设备身份；连接地址、凭据轮换或session变化不能悄悄生成已完成的新目标。
- 投递登记至少能恢复 `(workspaceId, batchId, targetId)`、内容校验值/重发来源、状态、尝试与错误、目标确认信息及会话世代。`pending`、传输缓存和进度按目标管理；全局来源vector用于事件因果/去重，不能替代任何目标的投递账本。切换目录或目标设置必须显式处理旧义务，不能调用旧bind逻辑清空另一路状态。

### 2. ACK只确认其目标，清理需满足全部条件

LAN ACK只证明已认证的该目标将相应批次持久接收。WebDAV ACK只证明相应不可变云文件及manifest发布条件已满足；它不证明任何具体设备已下载。ACK须绑定逻辑空间、`batchId`、`targetId`及内容校验值，且验证目标身份和当前有效会话/授权；未知、错目标、错内容或过期会话的ACK不能改变账本。

发送端在自己的数据库事务中持久确认该目标。重复ACK幂等，只返回/保持同一终态；不重复推进其他目标、来源游标或业务状态。LAN ACK不能删除待WebDAV义务，WebDAV ACK不能影响LAN及其他目标。任何旧WebDAV全局 `outbox id<=through` 删除入口都必须受新账本约束，不得旁路删除另一路唯一的可重发副本。

| 批次目标状态 | 必须保留的义务 | 是否允许清理唯一重发内容 |
|---|---|---|
| LAN已ACK，WebDAV待投递/待ACK | WebDAV完整义务及可重发内容 | 否 |
| WebDAV已ACK，LAN待投递/待ACK | LAN完整义务及可重发内容 | 否 |
| 两目标均待确认，任一路失败或ACK丢失 | 两目标独立状态及可重发内容 | 否 |
| 全部所需目标均完成 | 仍须核对批次、收据、快照、墓碑与历史保留条件 | 仅在保留策略同时满足后 |

GC以完整目标集合和明确保留策略为依据，在事务/恢复门槛下执行。重发载荷可迁移到其他已校验的本机持久副本后释放原物理outbox行，但未完成义务及其可重发能力必须保留；这不等于批次逻辑GC。保留期限不能自动把未ACK目标算成完成；设备撤销、离线、目标删除和切通道也不等于ACK，目标义务的终止须按明确记录的管理策略处理。删除墓碑、接收去重收据、冲突和需追溯业务历史有各自保留条件，不能由“上传成功”统一清空。批次GC也不证明永久历史或附件内容已可删除。

只要仍有未完成目标，发送端本机必须持久保留该批次的完整、不可变、可校验重发内容及账本引用。迁移载荷须先写入并校验新副本，再原子切换引用/释放旧行；崩溃后至少一份有效副本可读。仅保存远端WebDAV路径、内存缓存或不能重建原批次的最新实体快照均不满足要求；LAN补发不得依赖联网回取坚果云。恢复时内容缺失或哈希不符须明确报错并保留投递义务，不能默认为空批次或ACK。必测场景为WebDAV已ACK、LAN未完成、物理outbox已安全迁移后重启并阻断广域网，仍从本机副本向LAN发送同一批次。

### 3. 统一幂等、接收事务与ACK

接收去重与通道分离。接收端以逻辑空间和来源批次身份登记持久收据，同时依原 `actor + seq`/因果记录防止相同事件通过另一批次或快照再次应用；仅缓存连接内请求ID不够。LAN/WebDAV收到同一批次时共享这套规则，不回灌新的outbox或重复生成不可变业务历史事件。

接收顺序为：验证身份、协议能力、完整批次及内容 → 在同一事务完成实体/字段合并、墓碑/冲突、vector/clock、该来源合法连续游标及持久接收收据 → COMMIT成功 → 才发送ACK。无效批次、SQL失败或缺中间批次须明确失败，事务和游标保持原状；ACK不能以已入内存、已收到网络字节或部分SQL完成为依据。快照沿用逐片幂等应用及全部片成功后推进快照游标规则，不能对未完成快照发整体完成确认。

收到已持久记录且内容相同的重复批次，应读取收据并再次给出同一ACK，不重新应用事件。相同身份但校验值不同必须拒绝并保全诊断；不能以最后写入覆盖收据。事件重复、来源连续进度和目标确认分别检查，不能因LAN已应用某事件而跳过WebDAV尚未确认的投递义务。

### 4. 崩溃窗口必须可恢复

| 中断窗口 | 重启/重试要求 |
|---|---|
| 本地业务提交后，批次尚未冻结 | 原outbox仍在；事务冻结批次/所需目标后再发送，不漏事件 |
| 批次/目标登记提交后，首次发送前 | 从持久账本读取同一 `batchId` 和不可变内容继续各目标 |
| 接收事务COMMIT前 | 无ACK、无半批或提前游标；重新接收并完整提交 |
| 接收COMMIT后，ACK发送前或途中丢失 | 重试命中持久收据并重发ACK，不重复应用 |
| 发送端收到ACK后，本地确认事务提交前 | 重试相同批次/验证目标持久证据，再幂等写入该目标确认 |
| WebDAV文件/manifest已提交，本地确认未提交 | 检查原不可变内容及manifest引用后恢复同一目标确认，不能另造批次或假定所有目标完成 |
| 一目标已完成，另一目标失败；或租约过期/切设置后重启 | 已确认目标保持确认；其他义务和重发内容仍在；旧会话不能提交新会话进度 |
| GC事务前后中断 | 从账本、引用及保留状态恢复；不存在已删唯一载荷却仍未完成的义务，也不因外部文件标记落后重建为空队列 |

上述行为需Windows C、共享JS及Android Java真实存储适配共同实现并执行故障注入。当前源码未实现新增账本或LAN协议，本节不是其运行结果。

`delta-sync.mjs`已有可注入call/request，是抽象基础，但request仍是WebDAV GET/PUT/MKCOL及云路径，不是完整SyncTransport。新增LanTransport、Windows服务/mDNS及Android发现/配对/TLS/撤销时使用同一事件合约；Windows不能成为协议唯一合法服务端，PeerTransport仅预留。

现WebDAV信任模型为同一用户控制的客户端。LAN还需首次确认、一次性过期强令牌、独立设备授权、加密/撤销、失败限次、接口绑定与有界请求处理；当前同步代码未实现这些信任机制。

## 测试证据与缺口

已静态阅读 `tests/delta-sync.test.mjs`：39六SQLite客户端收敛；51中断重启/412；57缺批次；62冲突/墓碑；71事务回滚；75快照/离线新增；80旧云迁移；84条件GET；87适配器配合mock fetch压缩；91乱序重复；96会话锁；100切云目录；104未观察的草稿；108嵌套任务；112快照一致性；116/123父目录409。

`tests/sync-transport.test.mjs:2`注入fetch/protect/unprotect，无真实坚果云访问；`undo-sync.test.mjs`覆盖v1合并/ETag与撤销；`windows/selftest.c:5`覆盖C本地事务、重复、失败游标、冲突、墓碑与SQLite重开，不覆盖HTTP同步。

本子任务没有运行仓库测试，没有构建C/Android，没有连接坚果云/LAN。README/docs中的六客户端、真实Android和云端验收为历史记录索引，不是本轮通过结果。收到主Agent转达云端执行约束后停止所有本地测试/构建/探针；后续实际测试由主Agent在GitHub安排。

缺口为C/JS/Android Java生产存储适配协议向量互换、同库C/Node混用、Android实际桥接、LAN安全/断线、双通道交叉ACK/游标/崩溃及附件传输。云端先执行原版本现有测试和C自测，记录基线，再新增共同协议夹具；真机Wi-Fi/mDNS/后台/撤销仍需经授权的专用云端设备环境。Java计时测试不能替代 `ReplicaDatabase.java` 的SQLite/桥接同步验证。

共同夹具必须输入/导出真实Windows C、共享JS及Android Java存储路径，比较同一规范化实体投影、字段版本/冲突、墓碑、vector/cursors、outbox、目标投递与接收收据。覆盖排序和输入边界、重复/乱序/缺批次、同 `batchId` 跨通道、两种交叉ACK顺序、错误身份/内容ACK、COMMIT前后中断、重开库恢复、快照重放及GC前置条件。一个实现生成、另两个实现实际接收，再交换生成方；只读源码、独立模拟算法、JS mock或只在一个实现内部round-trip均不能宣称三端互操作通过。各环境的实际run、提交、日志、退出码和产物分开记录；未具备Android真实SQLite测试环境时明确未执行/blocked。

## 文件级任务顺序

1. 先完成C0-01/02的GitHub原版本实际基线并取得run证据；C0-03建立共同规范及生产实现协议向量。随后C0-04排序/校验、C0-05凭据互读、C0-06旧云恢复、C0-07 SQL错误传播各自独立commit和相关云端run，不能捆绑提交，也不能用静态结论代替通过。
2. 兼容门槛逐项实际验证后，严格按 `09-phase-one-entry-plan.md` 进入D1，保留entities/meta/outbox与事务接口。新增业务kind、字段及版本兼容需联合修改 `src/model.mjs`、`src/replica.mjs`、`windows/database.c`、`ReplicaDatabase.java`；旧客户端行为必须明确。
3. 新增每目标投递/确认和可恢复会话状态，涉及 `src/delta-sync.mjs`、三端存储桥、`windows/sync.c`；第二通道不得用全局ACK清队列。
4. 主Agent确定公共传输合约后新增LAN服务/发现/配对/认证；保留Node/Java/C WebDAV适配器与既有wire格式。
5. 增加附件元数据/独立内容传输、hash与中断恢复，再执行T01–T10/T14及双通道矩阵。

第一版实施优先Windows与Android。正式Web继续保留为产品平台，共享JS业务、数据适配及同步回归仍是每个相关切片的必测范围；正式Web同等优先级的全量UI重构暂缓。可交互网页Demo仍用于新界面定稿，不等于正式Web已完成。三端共同数据/协议质量门槛不能因UI优先级改变而降低。

本轮同步文档子任务仅修订本报告并新增 `07-development-standards.md`，未修改业务代码、运行项目测试/构建或新增探针。
