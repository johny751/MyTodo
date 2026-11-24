# D1-01-A 三端现有数据模型盘点

审查日期为 2026-11-24（Asia/Shanghai）。提交前在 GitHub 复核 `master` 为 `ca00c2504a31198f2d49e787483f9ebd2a48a7da`。它与阶段 0 生产源码固定点 `bc3f44d1e76a988dbe269edcf1c606eebec37293`（树 `e7db82447dd94cfc2881e0c91191099a7b14ff44`）相比，只增加 13 份 `docs/upgrade/` 下的阶段 0 和 D1-01 文档。盘点以该源码快照、Git blob 清单及 Android 构建固定的 Feedback Kit AAR 为依据。资料中的两个提交链接均对应同一生产源码。[master 基线](https://github.com/johny751/MyTodo/commit/ca00c2504a31198f2d49e787483f9ebd2a48a7da) · [远端差异](https://github.com/johny751/MyTodo/compare/bc3f44d1e76a988dbe269edcf1c606eebec37293...ca00c2504a31198f2d49e787483f9ebd2a48a7da) · [基线核查](baseline-verification.md)

## SQLite 对象

| 对象 | Windows C GUI | Node / Web | Android |
| --- | --- | --- | --- |
| 账本数据库 | 账户目录 `tasks.sqlite` | 默认服务根目录或次账户目录的 `tasks.sqlite`，浏览器经 `/api/sync` 和 `/api/state` 使用 | 应用私有账户目录 `tasks.sqlite`，WebView 经 `GxNative` 使用，原生后台也读同库 |
| 核心表 | `meta`、`entities`、`outbox`，16 列 | 同三表、16 列 | 同三表、16 列 |
| 应用辅助表 | `native_search`、`native_search_normal`、`native_search_dirty`、`native_index_meta`，6 列 | 源码声明 0 张 | 反馈 `feedback-kit.db` 独立含 `records`、`assets`、`links`、`settings`，20 列。恢复时临时 `validation.db` 复制这四表，再加 `archive_entries`、3 列 |
| 显式索引 | 3 个核心及 10 个 GUI 索引 | 3 个 | 3 个核心、4 个反馈（含部分唯一索引），临时恢复库复用反馈索引 |
| 隐式主键索引 | `entities` 及三张以 `key TEXT PRIMARY KEY` 声明的搜索表 | `entities` | 任务库 `entities`，反馈和临时库各自的文本或复合主键见附录 |
| 应用触发器 | GUI 初始化创建 `native_search_insert`、`native_search_update` | 源码声明 0 个 | 账本源码声明 0 个 |
| 库外存储 | 账号目录、同步配置及兼容缓存、提醒回执和本地台账、独立文本反馈、备份/交换文件 | 账号目录、同步配置和兼容缓存、旧状态、浏览器提醒和反馈等 | 账号目录、同步配置和兼容缓存、旧状态、提醒、番茄钟、小组件、伴随服务、反馈图片及 SAF 文件 |

Windows CLI 等仅走 `db_open` 的入口只确保核心 DDL。三端账本均声明 WAL 和 `synchronous=FULL`。显式索引计数排除 SQLite 引擎自动生成对象和系统表，列数按每端唯一声明去重。Android 反馈、框架及 WebView 对象的证据边界另见附录。DDL 及读写路径见 [Windows 库与文件](windows-storage-inventory.md)、[Node/Web 库与文件](node-web-storage-inventory.md)、[Android 库与文件](android-storage-inventory.md)。

## 数据归属

| 归属 | 当前存放的数据 | 读写及恢复边界 |
| --- | --- | --- |
| 跨端同步业务 | `tasks`（包括子任务行）、`notes`、`projects`、`tags`、`places` | `entities.data` 是业务投影，`record` 是复制合并输入。删除是 `_deleted` 事件及 `entities.deleted` 投影，普通活跃读取过滤墓碑。子任务按 `parentId` 表达关系，没有 SQL 级外键级联。 |
| 设备本地 | `meta.settings` 的四项交互设置、账本目录和选择、云端配置、提醒台账、Android 番茄钟明细、原生反馈、浏览器反馈 | 业务导出可包含局部设置。配置和依赖存储应保留各自作用域，账号、设备、Actor 与表达为字符串的业务项目不是同一身份。 |
| 派生数据 | `entities` 的 SQL 查询投影列、Windows 搜索表、任务统计、Web/Android WebView 搜索结果、Android 小组件计数和每日任务摘要 | 依赖当前行、过滤条件、时区和日期算法。Android 番茄钟的按日累计是实际保存的聚合，无法通过任务完成记录重建。 |
| 缓存数据 | WebView/浏览器账户读缓存、Windows 搜索规格化文本、当前实现的 manifest 读取缓存或历史 `sync-base` | 业务投影源、运行级网络缓存、遗留合并基准的恢复性质不同。`sync-base` 在旧数据导入中可被读取，不能只因文件名含 base 就视为可随意清除。 |
| 临时运行状态 | 编辑草稿、撤销、选中页与搜索词、应用内定时器、运行中的队列/请求和租约持有者 | 依据具体实现是否持久化计时锚点、视图键或者租约。无历史草稿/会话的数据不能从已保存任务补造。 |
| 同步基础设施 | Actor、版本和本地修订、seq、clock、queue、vector、cursors、scope、epoch、pending、迁移标记、outbox、冲突、远端 manifest/batch/snapshot | 必须与业务投影分开读。已 ACK outbox 的物理删除和业务墓碑是不同动作。状态备份和业务 JSON 导出是两个用途。 |

## 按审查问题导航

| 内容 | 资料 |
| --- | --- |
| Windows、Node/Web、Android 每个应用表、列、索引、触发器及文件入口 | [Windows](windows-storage-inventory.md) · [Node/Web](node-web-storage-inventory.md) · [Android](android-storage-inventory.md) |
| 成熟功能及复制数据逐字段对应、调用链及保留边界 | [三端实体和字段映射](cross-platform-field-mapping.md) |
| 同名异型、同义异名、缺字段、写入、白名单、空值及时间差异 | [三端差异清单](cross-platform-differences.md) |
| 现有源码无法得出的结论、需要后续证据的字段及路径 | [未确认事项](inventory-open-questions.md) |
| 静态对象计数、盘点入口及范围排除 | [覆盖与未覆盖路径](inventory-coverage.md) |

需要优先保留原始语义的是 `record` 与未确认队列、重复子任务的历史标识与时间、按名称绑定的任务分类，以及 Android 独有的番茄钟聚合。仅使用业务导出、界面显示值或 SQL 投影会丢失其中一部分。Windows C 旧 WebDAV v1 导入限制和 Android 首崩/换库/同库重开证据仍按阶段 0 原记录管理。[同步安全审查](../phase0-final-review/sync-safety-review.md) · [Android 风险审查](../phase0-final-review/android-stability-risk.md)

本批结论为静态源码盘点，运行验证为 `NOT TESTED`。本批供项目负责人审核，D1-01-B 等待负责人对本次盘点的明确反馈。
