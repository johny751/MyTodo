#ifndef MYTODO_STORAGE_MIGRATION_H
#define MYTODO_STORAGE_MIGRATION_H
#include "native.h"

#define STORAGE_MIGRATION_ID "mytodo-storage-infrastructure-0001"
#define STORAGE_CONTRACT_ID "d1-01-candidate.1"
#define STORAGE_ALGORITHM_ID "mytodo-storage-fingerprint-v2"

/* The build injects a digest of the actual production source bytes and fixed
   plan identity. A regular app build has no identity and cannot migrate. */
const char *db_migration_build_identity(void);

typedef struct {
 char schemaFingerprint[65],rawFingerprint[65],snapshotId[65];
 int userVersion;
 char *schemaPayload,*rawPayload,*databasePath;
 size_t schemaLength,rawLength;
} StorageSnapshot;

typedef struct {
 const char *migrationId,*contractId,*algorithmId,*implementationChecksum;
 const StorageSnapshot *sourceSnapshot;
} StorageMigrationRequest;

/* An optional diagnostic callback returns zero to continue. It must not run
   business writes. Callback definitions and process faults belong to tests. */
typedef int (*StorageMigrationObserver)(DB *db,const char *stage,void *context);

typedef struct {
 char status[40],attemptId[80],firstError[1024],rollbackError[1024];
 int sqliteCode,commitAttempted,commitReported;
} StorageMigrationResult;

int db_migration_capture(DB *db,StorageSnapshot *snapshot);
void db_migration_snapshot_free(StorageSnapshot *snapshot);
J *db_migration_snapshot_json(const StorageSnapshot *snapshot);
J *db_migration_result_json(const StorageMigrationResult *result);

/* Manual entry only; never called from db_open, constructor or app startup. */
int db_migration_apply(DB *db,const StorageMigrationRequest *request,
 StorageMigrationObserver observer,void *context,StorageMigrationResult *result);

/* Reopen an existing same-file database without CREATE/init/schema cleanup.
   Close the original handle first; keep both external attempt records. */
int db_migration_reopen(DB *db,const StorageSnapshot *source);
int db_migration_resolve(DB *reopened,const StorageMigrationRequest *request,
 StorageMigrationResult *result);
#endif
