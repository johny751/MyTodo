# D4-09 原型首轮门禁和归档修复

原源码 57a0438e1fe0e4a5be32eb46ce39f7746f7ed84e；Actions 46084728532 / attempt 1。Windows 与 Ubuntu 原始日志和 artifact ZIP 均保留于 outputs/MyTodo-D4-09-CI 对应源码目录。

Git 默认非 NUL 路径输出对中文文件名加引号并转义，导致 design-scope 的新增路径白名单拒绝文档；prototype-package 使用同类输出，导致读取中文文件名时 ENOENT。已从官方日志核实。改用 git diff --name-status -z 和 git ls-tree --name-only -z，按 NUL 解析，保持原有“基线所有文件不变、仅指定设计目录新增”的门禁语义。每个 status/path 都进行验证。

语法检查步骤新增 !cancelled()，即使前置门禁失败也会保留语法诊断。原测试、首轮日志及失败报告未改；本修复尚待下一轮 Actions 验证。本地仅静态阅读与 Git 操作，没有本地运行构建或测试。
