# C007 首轮 Android 证据审计

2026-11-23（Asia/Shanghai）。run `45180141745` / attempt `1`，源 `4a8dd94f7fbceeb0583c37cc7aefdb29e9937691`。本审计仅读取本地文本/JSON并核对长度与SHA256；没有执行项目、脚本、SQLite、ADB或构建，没有联网。证据根：`outputs/c0-07/evidence/45180141745/`。主控提供下载归档SHA256为 `d1a4b784556f36a8e9ce1ee1e314683041f6aa50d68d1d3c4fa25a8e7d9a6bd9`；本审计未重新读取压缩包验证该值。

**结论：Android 构建与安装准备成功；10个顶层场景全部在首次 seed 入口等待失败，没有证实任何业务操作完成、故障命中或原库恢复。此结果是夹具入口失败，不是生产SQL通过，也不应计作55项业务操作已执行。**

## 实际计数与失败链

| 单位 | 本轮结果 |
| --- | --- |
| 顶层场景控制器 | 10启动，10失败，0通过 |
| 已发出的操作尝试 | 10；每个case仅`000-seed`，mode=init、operation=local |
| 业务操作完成回执 / 故障注入完成证据 | 0 / 0；不能由启动instrument推导业务已执行 |
| instrument ADB进程 | 10次约150秒超时，SIGTERM、exitCode=null、instrumentationCode=null |
| Android worker | 10次exit1；外层worker进程正常回收，未被300秒控制器超时强杀 |
| summary断言 | 20项，全部失败：每case各`exit`、`database-preserved` |
| 同库重开 / 预期死亡marker / naturalExit | 0 / 0 / 0 |
| DB与边车取证 | 40项有效missing收据；0文件preserved |

十份request、Android process receipt与summary的source/case/attempt/dbCase身份一致；10个dbCase互异，每case没有retry。50次结果/前置/operation/两个kill-marker存在性检查均返回不存在。控制器随后读取缺失的`000-seed.result.json`报ENOENT。Android worker最终error为`Original Android SQLite unavailable or not verified; no preserved-database claim`；这一较后错误不能掩盖同receipt内先发生的instrument超时。suite与report的Android状态均failed/exit1；report封存仍为sealed，但`reportStatus=failed`、`reportExitCode=1`，没有绿色结论。

## 入口路径证据及直接日志的边界

本轮`source.json`、build metadata与producer seal将入口文件绑定到SHA `fc58157c864789ead8e8eb25910842a2508a7a1fc77126959656c6dd2d59a413`。已读取的本地原始输入`work/c007-tests-input/tests/fault-harness/android/c007-android-entry.mjs`具有完全相同SHA，第3行导入`./src/.c003-delta-adapter.mjs`。

本轮`build/verify-packaged-webview-assets.log`实际jar清单列出`assets/src/c003-delta-adapter.mjs`；metadata只有无前导点的asset，SHA为`38525e83347d87f42356a8b36e482d27ac42a8ccbf93bf8f7cb28bd8819430d8`。因此已通过本轮输入身份与实际打包清单证实资源名不匹配。入口及适配器`.mjs`文件本身属于cloud-only，未伪称本地读到本轮APK资产。没有直接读取到WebView的403/import-error原始日志，不编造该日志；路径错误与10次入口无回执/超时相符。

## 原数据库、进程死亡与崩溃资格

10次启动前数据库存在性检查均不存在；清理force-stop后10次pidof都是code1，stdout/stderr空。其后每case的tasks.sqlite/WAL/SHM/journal均为`before.valid=true,state=unavailable,reason=missing`，传输命令成功且stderr空；没有主库头、字节传输或readback可验，也没有保全原数据库。控制器`pre-reopen/files.json`的absent-at-observation与此一致。missing仅描述该观察点，不断言历史上从未建库，更不称为原库恢复成功。

预期before-commit/after-ack死亡步骤均未到达。这里SIGTERM针对超时的ADB子进程，后续force-stop为清理；没有native boundary marker或自然退出证据，不能写成Android真实事务边界死亡通过。

40项探测的原始stdout及其他命令输出仍在云端。Android全部596个`.stdout/.stderr`文件未纳入本地文本包；其hash与bytes已与process commands及producer/collector清单交叉核对一致。10份instrument stdout/stderr均为0B，10份crash-log stdout也为0B；exit-info stdout为143至6771B，原文未本地审阅。环境收尾AndroidRuntime过滤日志亦无正文。空crash buffer不能证明没有意外进程退出；当前不能确定本轮意外crash次数/根因，不把超时改记为C006已知`DEPENDENCY DIED`。若需该层审计，应保留原run并定向补取exit-info和必要WebView日志。issue #1的历史开放资格不因此关闭。

## 本轮环境与APK身份

环境来自同run/attempt/source的`c007-android-environment-45180141745-1/environment.json`，C004环境schema，status=ready/exit0；shutdown=finished/exit0。这是环境资格，不是第四个平台或测试通过。

- GitHub hosted Ubuntu24 X64，imageVersion `20261116.376.1`；Node `v22.23.5`；Temurin JDK `17.0.21+9`。
- Emulator `37.3.10.0`；API34 google_apis x86_64 image revision14；serial `emulator-5554`；WebView `com.google.android.webview 113.0.5672.136`。
- 环境shell sqlite CLI是`3.39.2`；prepare的Node verifier SQLite是`3.54.1`。因没有native describe/attempt结果，本轮实际framework SQLite版本未取得，不能用这两个数字替代。
- 本轮允许并实际安装官方Google emulator/system image与Ubuntu libpulse0；收据保留来源及hash。未在本机安装或执行。
- 独立测试APK为167011B，SHA `d0944284c7567ebd100fd731ce90aa715b1ea665b7f5d349312bf17ecdafaa9d`，build/prepare/10份worker与cloud inventory一致。APK为cloud-only，仅交叉清单，不本地重算。非正式发布/升级APK。

## 封存复核与索引

原collector为exit0、evidenceComplete=true、3559 producer rows、2567 copied text files、997 cloud-only files；这是采集结论，不是测试成功。本次独立核对Android artifact与环境共223份本地文本的长度/SHA全部匹配；Android producer846项、环境producer43项与collector库存全部对应；596个命令stdout/stderr哈希逐项对应，无不一致。Android库存847项=179本地+668cloud-only；环境44项全在本地。未声称本地重算cloud-only字节。

关键文件相对证据根及SHA256：

| 文件 | SHA256 |
| --- | --- |
| artifacts/c007-android-45180141745-1/suite/suite.json | a6259b6143341f88e375e12b1ae38152e5e11222f017df4d27558b4592a022f4 |
| artifacts/c007-android-45180141745-1/build/build-receipt.json | e00c636fd6776643b5c6e4d18eb22c6593af7830bc85db5eb6a41d29d4437281 |
| artifacts/c007-android-45180141745-1/build/assets/build-metadata.json | d7abd34f2f8c612f8e4608b1f481e37929e3655481d88d449c24240a304bf504 |
| artifacts/c007-android-45180141745-1/prepared.json.receipt.json | b89e59e9318e6fb999fdd1faad1f30c367e541d85818591d3ae4cd2643cb290e |
| artifacts/c007-android-environment-45180141745-1/environment.json | d05626487a397b47dd97fb95f7c9895ca1297fc46e26b1d744a51c2c659df877 |
| artifacts/c007-android-environment-45180141745-1/shutdown.json | 2b70480f408244bc4ebf247cd9bf4a35f6bf71cedc859bbf3424139a61cc7977 |

每case完整尝试见`artifacts/c007-android-45180141745-1/suite/<case>/000-seed.result.json.android-process.json`、`000-seed.request.json`、`summary.json`及对应`inventory.json`。后续342/feb夹具修正和新运行独立记录，不回写本轮结果；本审计不判定新版运行。
