# Windows production undo capture extraction

Updated 2026-11-24 Asia/Shanghai. Root approved this focused isolated-branch extraction after CI3 (`d579`, run `45414368180`) compiled C but failed to link unused operations.obj references to task_delete, config_save, ui_changed and make_key. Failed logs/artifacts remain evidence; no assertion or real storage API was removed.

The pre-extraction `windows/operations.c` SHA256 was `61f02a521236d09786d1dbe2f4305c96d0f1be62cdee1cb833e9944b60afc483`. Its complete undo_capture function body moved to `windows/undo-capture.c` without any byte change. The four former static zero-initialized values are owned by one prefixed private `gx_undo_capture_state`; its header supplies lvalue aliases for the old names. The state still has the same before/keys pointer values, 160-byte label and reversing flag, initialization, lifetime and access pattern. The public undo API, database flow, metadata, outbox, sync and GUI startup behavior remain the same.

Static UTF-8 body hashes (excluding the line terminator) match before and after:

| Function | SHA256 |
| --- | --- |
| undo_capture | ed9ea41e2e1c3c61d0a932af03398ddefb31fb3100760be0aa5d2da16331b7c4 |
| undo_begin | 28112b8291f3dffc1c59a92532785e86240c046158354fbab994d41bac83241c |
| undo_finish | 65cbfff4b0169c9aac4c861c9a17917a633c6544ff2c7659c5c32f7095e04c46 |
| undo_apply | aae5601c75aecdc4fa4cc9ab869eef7bc7c09c90df3361068bcc7a17c4fba117 |

The frozen production build was inspected at `C:/Users/adwoo/Documents/Codex/2026-11-23/x20/work/phase0-master/scripts/build-windows.mjs`, referenced by `package.json`'s build:windows command. It contains an explicit source array, not a glob. The script was copied into the candidate tree and the single `'undo-capture.c'` item was added after `'operations.c'`. Removing that item restores the complete original script text. No other build behavior changed.

Original script SHA256: `a9199dc51822c2a12d6823f23417286c82525c36243d94d00130a94044d93693`.
Candidate script SHA256: `1fe24d3022854994d34f09df46434b4a3c640d1cf6eaac23e4f11982b5623114`.

The headless Actions build now compiles actual database.c, migration.c, util.c and undo-capture.c with bundled SQLite/cJSON, the real App state and unchanged readiness guard. The source checksum also binds the new private header and the reviewed operations source. No storage/undo stub, GUI replacement, app activation or local build/test/SQLite execution was introduced. All 30 existing assertions remain; their runtime conclusion awaits the next Actions run.
