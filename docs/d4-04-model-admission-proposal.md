# D4-04 remaining model and native timer admission

Status: proposal only. No schema/model/protocol/sidecar implementation is authorized by this file. Baseline `9fe8824754af4e8b541f3550e677564183fa7c1f` accepts only `tasks`, `notes`, `projects`, `tags`, `places` in Windows production entity validation. Isolated prototype `repo.demo` also contains work items, templates, process instances, contacts and project metadata; those records have no approved production mapping.

## Required decisions for independent work modules

| Proposed concept | Required relationship/invariant | Decision required before implementation |
| --- | --- | --- |
| Independent work item | Distinct identity from personal tasks; project ownership; optional explicit task linkage | Whether new storage entity is admitted, field contract, conflict/deletion rules |
| Process template | Ordered versioned steps, immutable historical version for existing runs | Template/step storage and version semantics |
| Process instance | References exact template revision, project/work item; per-step state and completion | Instance state machine, lifecycle, concurrent updates |
| Contact and interaction | Contact identity distinct from free text; explicit project/work linkage | Relationship cardinality, deletion/tombstone behavior, history retention |
| Project work metadata | Existing project name-based task relation remains readable | Approved stable ID adapter and collision policy without silent migration |
| Cross-platform storage | Same explicit business contract on Win32/Android/Web | Versioned adapter admission and synthetic contract/regression fixtures |

Approval must resolve these relationships before choosing new tables or protocol entities. Proposals do not authorize merging D2, changing original ACK/outbox/cursor/manifest/batch semantics or migrating real databases. Existing tasks/notes must not be used as opaque JSON containers for unapproved work models. Demo synthetic records must not be imported into real user stores.

After an explicit model decision, prepare an isolated adapter, exact field/behavior contract, rollback/export compatibility and cross-platform synthetic tests for review. A later approval is still required before real-user migration or real-remote activation.

## Windows timer gap

Static inventory of the exact accepted `windows/` implementation found no native PomodoroClock, timer UI, session history or persistence adapter. The accepted isolated UI does have a web timer and an Android native timer with tested behavior. Those files remain untouched by D4-04. Therefore this candidate cannot truthfully describe an original Win32 timer as preserved or already integrated.

A correct native implementation can reuse the accepted timer **behavioral contract**: countdown/count-up, running/paused state, focus/break durations, explicit completion confirmation, associated task identity, cancellation, durable session history and recovery. It must use actual elapsed/deadline state, not fake in-memory demo status. Pending configuration drafts must remain distinct from committed timer configuration.

Persistence options requiring admission:

1. Reuse an approved shared timer store/adapter, if the three-platform production contract provides one. Specify task ID mapping, versioning, recovery and synchronization exclusion.
2. Approve a per-account local sidecar schema, atomic replace and recovery strategy, path/backup/account-switch behavior and explicit exclusion from task sync. No such sidecar is created in this candidate.
3. Approve a production SQLite extension only after model review; this is currently prohibited and is not implemented.

Native service details must then cover wall-clock jumps, sleep/resume, process restart, durable history, concurrent app instances, notifications and UI completion acknowledgement. A volatile stopwatch without recovery would not satisfy the accepted functionality and is not used as a shortcut.

These pending decisions are D4-04/D4-06 blockers; candidate build and isolated test success cannot grant their production admission.
