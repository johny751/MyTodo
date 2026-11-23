# C006 最终源报告包

生产源 `1b9c41fbc543f4e31c1e1a22c3b0fe0419eb4e35`，整理日期 2026-11-23（Asia/Shanghai）。核心/强杀/bootstrap/基线/936 矩阵独立审计均已合并，主控确认实测门禁满足限定验收，**C006 关闭**。状态为 `accepted=true`、`status=accepted-with-documented-evidence-qualifications`、`pending=[]`。Android 稳定性问题仍为 open，C007 独立验收，D1 未获批准。

- `c0-06-report.md`：最终行为、实测结果、真实故障边界、首崩及证据资格。
- `c0-06-compatibility.md`：协议、数据库、平台、迁移及发布限制。
- `c0-06-case-results.md` / `.json`：最终五组 89 个实际场景行及历史红测对应，不混入其他 suite 的计数。
- `c0-06-verification.json`：限定验收、原收集与审计状态、源码关联。
- `c0-06-environment.md` / `.json`：云端环境与命名构建产物收据，未在本地执行。
- `report-provenance.json`：输入及本目录其他文件的实际长度和 SHA256；自身不自哈希。

仓库部署位置为 `docs/upgrade/c0-06/reports/`。四份独立审计随包部署至 `docs/upgrade/c0-06/audit/`：`../audit/final-core-evidence-review.md`、`../audit/final-kill-evidence-review.md`、`../audit/final-matrix-evidence-review.md`、`../audit/latest-evidence-review.md`。本机源审计仍保留在 `outputs/c0-06/`，不为调整仓库链接而改写原件。

原始证据大目录不上传仓库。当前本地归档根为 `C:/Users/adwoo/Documents/Codex/2026-11-23/x20/outputs/c0-06/evidence/`；helper 定向验证在 `C:/Users/adwoo/Documents/Codex/2026-11-23/x20/outputs/android-stability/evidence/`。JSON/provenance 中的 `outputs/...` 或 `work/...` 路径相对本机工作区 `C:/Users/adwoo/Documents/Codex/2026-11-23/x20/`，是本地审计索引；云端二进制仍属于对应 GitHub artifact，不意味着存在于仓库或本地文本包。

| 证据范围 | GitHub run |
| --- | --- |
| C006 核心 | [45170150079](https://github.com/johny751/MyTodo/actions/runs/45170150079) |
| Android 内部强杀 | [45170150057](https://github.com/johny751/MyTodo/actions/runs/45170150057) |
| bootstrap/CAS | [45170150092](https://github.com/johny751/MyTodo/actions/runs/45170150092) |
| 原项目基线 | [45170150066](https://github.com/johny751/MyTodo/actions/runs/45170150066) |
| 完整协议矩阵 | [45170150060](https://github.com/johny751/MyTodo/actions/runs/45170150060) |
| C005 DPAPI（直接源 32e） | [45168648612](https://github.com/johny751/MyTodo/actions/runs/45168648612) |
| helper 定向验证（直接源 8ce） | [45169951082](https://github.com/johny751/MyTodo/actions/runs/45169951082) |

早期草稿与红测保持原样，不以本报告替换原始收据。24 个核心合成凭据文件保持排除；未下载、读取或解密凭据。核心与基线原 collector exit1/incomplete 保持不变，限定验收没有把它们改成 complete。本地工作仅文本、JSON 与 SHA256 审计，没有本地项目执行。
