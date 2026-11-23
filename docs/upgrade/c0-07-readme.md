# C0-07 验收材料索引

本组材料记录 MyTodo 的 SQL、发布与 ACK 故障修复、真实云端运行及证据边界。最终结论以 `c0-07-verification.json` 的主 Agent 限定验收字段与主报告为准；原始测试、采集器与历史审计的失败值均保留。

- [主报告](c0-07-report.md)：修复范围、真实红绿测试、回归关联与未覆盖范围。
- [四轮逐场景对照](c0-07-case-results.md) · [结构化结果](c0-07-case-results.json)。
- [执行环境与实际安装依赖](c0-07-environment.md) · [构建命令与产物哈希](c0-07-environment.json)。
- [验证与限定验收记录](c0-07-verification.json)。
- [证据来源与发布字节映射](c0-07-provenance.json)。
- [最终独立审查](c0-07-final-independent-review.md)。

`c0-07-evidence/` 保存独立审查与精确源身份收据的文本发布副本。原始 `work/`、`outputs/` 引用标识审查输入，不是 GitHub 仓库路径；其对应发布副本由 provenance 同时列出原件与发布件的长度和 SHA256。发布仅规范文本换行，保留原件字节与原始哈希；不能用副本哈希冒充原证据哈希。

完整原始 ZIP、collector 收据和逐文件文本仍保存在本地 `outputs/c0-07/evidence/<runId>/`；APK、EXE、SQLite 等二进制留在 GitHub 产物及 Codespaces。原始 GitHub run ID 与 source SHA 在各报告中分别保存。文本归档排除、历史崩溃与重试不是零值，也不由 `sealed` 字段变成通过。

C005、C006 已有报告独立保留。本轮 C007 及后续回归不覆盖旧报告。D1 未授权，业务 UI、LAN 同步与正式签名 APK 发布不属于本次交付。
