# 原生版依赖

- SQLite 3.38.2 amalgamation：https://github.com/azadkuh/sqlite-amalgamation ，SQLite 公有领域。
- cJSON 1.7.19：https://github.com/DaveGamble/cJSON/tree/v1.7.19 ，MIT；本地修改采用 17 位 double 输出及严格数值比较，保持协议值一致。许可证见 cJSON-LICENSE。
- zlib 1.3.1：https://github.com/madler/zlib/tree/v1.3.1 ，许可证见 zlib/LICENSE。仅编译压缩及解压所需源码。

所有依赖静态链接，无额外运行 DLL。
