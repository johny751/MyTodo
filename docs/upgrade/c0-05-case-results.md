# C0-05 真实凭据互读逐例对照

2026-11-23，Asia/Shanghai。全部执行来自 GitHub Windows runner；本机仅整理已下载文本。

| 场景 | 原实现 fad9d823 | 生产修复 2114f152 | 最终同源 648f5508 | 原始失败 |
| --- | --- | --- | --- | --- |
| c-to-node-ascii | passed | passed | passed | — |
| node-to-c-ascii | failed | passed | passed | C config_read differs |
| c-to-node-unicode | passed | passed | passed | — |
| node-to-c-unicode | failed | passed | passed | C config_read differs |
| c-modern-format | failed | passed | passed | C modern prefix missing |
| node-blank-password-preserves | failed | passed | passed | C reread after blank Node password differs |
| empty-file-first-open | failed | passed | passed | First-open empty-file protections failed |
| legacy-utf16 | failed | passed | passed | C legacy rewrite not modern |
| legacy-powershell | failed | failed | passed | PowerShell legacy creation failed |
| reject-truncated | failed | passed | passed | Node cached read accepted malformed file |
| reject-odd-hex | failed | passed | passed | Node cached read accepted malformed file |
| reject-wrong-prefix | failed | passed | passed | Node cached read accepted malformed file |
| reject-nonhex | failed | passed | passed | Node cached read accepted malformed file |
| reject-cipher-corrupt | failed | passed | passed | Node cached read accepted malformed file |
| reject-empty | failed | passed | passed | Node cached read accepted malformed file |
| reject-nul-trailing | failed | passed | passed | Node cached read accepted malformed file |
| reject-oversized | failed | passed | passed | Node cached read accepted malformed file |
| protected-invalid-json | failed | passed | passed | C replaced malformed decrypted payload |
| protected-json-scalar | failed | passed | passed | C replaced malformed decrypted payload |
| protected-invalid-utf8 | failed | passed | passed | C replaced malformed decrypted payload |
| protected-trailing-json | failed | passed | passed | C replaced malformed decrypted payload |
| read-access-denied | failed | passed | passed | C treated unreadable file as missing |

legacy-powershell 的首次失败发生于测试夹具创建，独立诊断后修复内置 PowerShell Security 模块选择；不记作生产凭据修复。初次 run 45153269614 的 C2040 编译失败未执行这 22 例。

最终必须正常进程退出、结构化布尔断言成立；崩溃/超时不算正确拒绝。损坏或不可读文件的读写失败需保留原密文字节。旧格式为同用户 DPAPI UTF-16LE，新写格式为 gx-dpapi-v1: + DPAPI UTF-8。
