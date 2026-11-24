"""Independent synthetic storage cases. Execute only in authorized GitHub jobs.

Source databases stay frozen. Every mutation targets a fresh SQLite-backup copy.
Fault workers really exit; probe workers are separate new processes on the same path.
"""
import json
import os
import pathlib
import sqlite3
import subprocess
import sys

from isolation import GUARD, json_bytes, logical_dump, open_db, root_path, safe_file, sha
from migration import (
    MIGRATION, checksum, migrate, original_dump, restore_gate, snapshot,
    target_hash, verify_backup, verify_original_bytes,
)

HERE = pathlib.Path(__file__).resolve().parent
REMOTE = {'synthetic': True, 'scope': 'synthetic-scope', 'epoch': 'synthetic-epoch',
          'heads': {'Synthetic-A': 3, 'Synthetic-B': 2}, 'evidenceComplete': True}


def _fresh_bytes(root, name, data):
    path = safe_file(root, name, must_exist=False)
    with path.open('xb') as stream:
        stream.write(data)
    return path


def _dump(root, path):
    db = open_db(root, path)
    try:
        return original_dump(db)
    finally:
        db.close()


def _copy(root, source, name):
    target = safe_file(root, name, must_exist=False)
    if target.exists():
        raise AssertionError('refuse existing synthetic case database')
    src = open_db(root, source)
    dest = sqlite3.connect(target, isolation_level=None)
    try:
        src.backup(dest)
    finally:
        dest.close()
        src.close()
    if _dump(root, target) != _dump(root, source):
        raise AssertionError('fresh SQLite backup changed source values/types')
    return target


def _reject(fn, contains=None):
    try:
        fn()
    except (RuntimeError, ValueError, FileNotFoundError, sqlite3.DatabaseError) as error:
        if contains is not None and contains.casefold() not in str(error).casefold():
            raise AssertionError('wrong rejection: ' + str(error)) from error
        return {'expectedRejection': True, 'errorType': type(error).__name__,
                'primaryError': str(error)}
    raise AssertionError('unsafe candidate unexpectedly accepted')


def _worker(root, database, label, fault=None, probe=False):
    root = root_path(root)
    database = safe_file(root, database)
    argv = ([sys.executable, str(HERE / 'storage_cases.py'), '--probe', str(root), str(database)]
            if probe else [sys.executable, str(HERE / 'migration.py'), str(root), str(database)])
    if fault is not None:
        argv += ['--fault', fault]
    process = subprocess.Popen(argv, cwd=HERE, env=os.environ.copy(),
                               stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE)
    timed_out = False
    try:
        stdout, stderr = process.communicate(timeout=90)
    except subprocess.TimeoutExpired:
        timed_out = True
        process.kill()
        stdout, stderr = process.communicate()
    prefix = label + '-pid-' + str(process.pid)
    stdout_path = _fresh_bytes(root, prefix + '.stdout', stdout)
    stderr_path = _fresh_bytes(root, prefix + '.stderr', stderr)
    evidence = {'argv': argv, 'pid': process.pid, 'database': str(database),
                'exitCode': process.returncode, 'timedOut': timed_out,
                'stdout': stdout_path.name, 'stderr': stderr_path.name,
                'stdoutBytes': len(stdout), 'stderrBytes': len(stderr),
                'stdoutSha256': sha(stdout), 'stderrSha256': sha(stderr)}
    if timed_out:
        raise AssertionError('worker timeout; original output retained: ' + json.dumps(evidence))
    if probe:
        if process.returncode != 0:
            raise AssertionError('same-path probe failed: ' + stderr.decode('utf-8', 'replace'))
        value = json.loads(stdout)
        if value['pid'] != process.pid or value['database'] != str(database):
            raise AssertionError('same-path/new-process evidence identity mismatch')
        evidence['observed'] = value
    else:
        matches = list(root.glob(database.name + '.attempt-' + str(process.pid) + '-*.json'))
        if len(matches) != 1:
            raise AssertionError('new migration PID must have exactly one immutable attempt identity')
        attempt = safe_file(root, matches[0])
        value = json.loads(attempt.read_bytes())
        if value['pid'] != process.pid or value['database'] != str(database):
            raise AssertionError('migration attempt belongs to different process/database')
        evidence['attempt'] = value
        evidence['attemptPath'] = attempt.name
        evidence['attemptSha256'] = sha(attempt.read_bytes())
    return evidence


def _probe(root, database):
    root = root_path(root)
    database = safe_file(root, database)
    # A new actual process opens the exact same writable candidate, allowing
    # the real SQLite engine to recover its interrupted journal/WAL state.
    db = open_db(root, database, write=True)
    try:
        integrity = [row[0] for row in db.execute('PRAGMA integrity_check')]
        if integrity != ['ok']:
            raise AssertionError('same-path SQLite integrity failure')
        registry_exists = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='d1_migration_registry'").fetchone()
        registry = [dict(row) for row in db.execute('SELECT * FROM d1_migration_registry')] if registry_exists else []
        return {'pid': os.getpid(), 'database': str(database),
                'sqliteVersion': sqlite3.sqlite_version, 'integrity': integrity,
                'userVersion': db.execute('PRAGMA user_version').fetchone()[0],
                'originalHash': sha(json_bytes(original_dump(db))),
                'tables': sorted(row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")),
                'registry': registry, 'targetHash': target_hash(db) if registry_exists else None,
                'rowsCount': db.execute('SELECT count(*) FROM entities').fetchone()[0],
                'outboxCount': db.execute('SELECT count(*) FROM outbox').fetchone()[0],
                'foreignKeyErrors': [list(row) for row in db.execute('PRAGMA foreign_key_check')]}
    finally:
        db.close()


def run_storage_cases(root, source_path, record):
    """record(case_id, name, fn) executes fn and records its real pass/fail."""
    root = root_path(root)
    source = safe_file(root, source_path)
    frozen_bytes_hash = sha(source.read_bytes())
    frozen = _dump(root, source)
    frozen_hash = sha(json_bytes(frozen))
    fixture = json.loads(safe_file(root, 'fixture.json').read_bytes())

    def case_copy(case_id):
        return _copy(root, source, case_id + '-candidate.sqlite')

    def successful_worker(path, label):
        output = _worker(root, path, label)
        assert output['exitCode'] == 0, output
        assert output['attempt']['status'] in ('committed', 'idempotent'), output
        return output

    def normal():
        path = case_copy('S01')
        first = successful_worker(path, 'S01-migrate')
        probe = _worker(root, path, 'S01-reopen', probe=True)
        actual = probe['observed']
        assert probe['pid'] != first['pid']
        assert actual['userVersion'] == 1001 and actual['originalHash'] == frozen_hash
        assert len(actual['registry']) == 1
        registry = actual['registry'][0]
        assert registry['migration_id'] == MIGRATION and registry['checksum'] == checksum()
        assert registry['status'] == 'committed' and registry['source_hash'] == frozen_hash
        assert registry['target_hash'] == actual['targetHash']
        assert not actual['foreignKeyErrors']
        db = open_db(root, path)
        try:
            verify_original_bytes(db, fixture)
            assert db.execute('SELECT count(*) FROM d1_raw_sources').fetchone()[0] == len(fixture['rows'])
        finally:
            db.close()
        return {'migration': first, 'newProcessReopen': probe, 'rawOriginalBytesVerified': True}

    record('S01', 'atomic migration registry and user_version 1001', normal)

    def idempotence():
        path = case_copy('S02')
        first = successful_worker(path, 'S02-first')
        before = _worker(root, path, 'S02-before', probe=True)
        second = successful_worker(path, 'S02-second')
        after = _worker(root, path, 'S02-after', probe=True)
        assert second['attempt']['status'] == 'idempotent'
        assert first['pid'] != second['pid']
        for key in ('userVersion', 'originalHash', 'tables', 'registry', 'targetHash', 'rowsCount', 'outboxCount'):
            assert before['observed'][key] == after['observed'][key], key
        return {'firstAttempt': first, 'secondAttempt': second,
                'beforeReopen': before, 'afterReopen': after}

    record('S02', 'same immutable migration id/checksum does not repeat', idempotence)

    def wrong_checksum():
        path = case_copy('S03')
        before = _dump(root, path)
        rejection = _reject(lambda: migrate(root, path, expected_checksum='0' * 64), 'checksum mismatch')
        assert _dump(root, path) == before
        db = open_db(root, path)
        try:
            assert db.execute('PRAGMA user_version').fetchone()[0] == 0
            assert not db.execute("SELECT 1 FROM sqlite_master WHERE name='d1_migration_registry'").fetchone()
        finally:
            db.close()
        return rejection

    record('S03', 'different implementation checksum rejected before SQL', wrong_checksum)

    def drift(case_id, sql, parameters):
        path = case_copy(case_id)
        first = successful_worker(path, case_id + '-first')
        db = open_db(root, path, write=True)
        try:
            db.execute(sql, parameters)
        finally:
            db.close()
        before = _dump(root, path)
        db = open_db(root, path)
        try:
            full_before = logical_dump(db)
        finally:
            db.close()
        second = _worker(root, path, case_id + '-drift')
        assert second['exitCode'] != 0 and 'BLOCKER' in second['attempt'].get('primaryError', '')
        assert _dump(root, path) == before
        db = open_db(root, path)
        try:
            assert logical_dump(db) == full_before
        finally:
            db.close()
        return {'firstAttempt': first, 'rejectedAttempt': second, 'postDriftOriginalPreserved': True}

    record('S04', 'source raw fingerprint drift rejected',
           lambda: drift('S04', 'UPDATE meta SET value=? WHERE id=1', (fixture['meta'] + ' ',)))
    record('S05', 'successful registry checksum drift rejected',
           lambda: drift('S05', 'UPDATE d1_migration_registry SET checksum=?', ('f' * 64,)))
    record('S06', 'registry missing successful migration row rejected',
           lambda: drift('S06', 'DELETE FROM d1_migration_registry', ()))
    record('S07', 'registered target user_version drift rejected',
           lambda: drift('S07', 'PRAGMA user_version=1002', ()))

    def unknown_schema(case_id, sql):
        path = case_copy(case_id)
        db = open_db(root, path, write=True)
        try:
            db.execute(sql)
        finally:
            db.close()
        before = _dump(root, path)
        rejection = _reject(lambda: migrate(root, path), 'BLOCKER')
        assert _dump(root, path) == before
        return rejection

    record('S08', 'unknown source schema table rejected',
           lambda: unknown_schema('S08', 'CREATE TABLE synthetic_unknown_table(id INTEGER)'))

    def named_columns():
        path = case_copy('S09')
        db = open_db(root, path, write=True)
        event = fixture['outbox'][0]['event']
        try:
            db.execute("ALTER TABLE outbox ADD COLUMN synthetic_extra TEXT DEFAULT 'sentinel'")
            db.execute('INSERT INTO outbox(id,event) VALUES(?,?)', (200, event))
            observed = db.execute('SELECT id,CAST(event AS BLOB),synthetic_extra FROM outbox WHERE id=200').fetchone()
            assert observed[0] == 200 and observed[1] == event.encode('utf-8') and observed[2] == 'sentinel'
            rejection = _reject(lambda: db.execute('INSERT INTO outbox VALUES(?,?)', (201, event)), 'columns')
            assert not db.execute('SELECT 1 FROM outbox WHERE id=201').fetchone()
            for original in fixture['outbox']:
                actual = db.execute('SELECT CAST(event AS BLOB) FROM outbox WHERE id=?', (original['id'],)).fetchone()[0]
                assert actual == original['event'].encode('utf-8')
            return {'namedInsertOriginalTextPreserved': True, 'newColumnDefault': observed[2],
                    'positionalInsertExpectedRejection': rejection, 'sqliteVersion': sqlite3.sqlite_version}
        finally:
            db.close()

    record('S09', 'explicit columns survive a synthetic extra column; positional SQL fails', named_columns)

    def interruption(case_id, kind, stage):
        path = case_copy(case_id)
        fault = kind + ':' + stage
        first = _worker(root, path, case_id + '-first-fault', fault=fault)
        assert first['exitCode'] == (91 if kind == 'kill' else 1), first
        assert first['attempt']['stage'] == stage and first['attempt']['fault'] == fault
        if kind == 'error':
            assert first['attempt']['primaryError'] == 'injected-primary-' + stage
            stderr = safe_file(root, first['stderr']).read_text(encoding='utf-8')
            assert 'injected-primary-' + stage in stderr
        probe = _worker(root, path, case_id + '-same-path-reopen', probe=True)
        actual = probe['observed']
        assert probe['pid'] != first['pid'] and probe['pid'] != os.getpid()
        assert actual['originalHash'] == frozen_hash
        committed = stage == 'after_commit'
        assert actual['userVersion'] == (1001 if committed else 0)
        if committed:
            assert len(actual['registry']) == 1 and actual['registry'][0]['status'] == 'committed'
            assert actual['registry'][0]['checksum'] == checksum()
        else:
            assert not actual['registry']
            assert not any(name in actual['tables'] for name in ('d1_raw_sources', 'd1_projection', 'd1_relations', 'd1_migration_registry'))
        continuation = successful_worker(path, case_id + '-continuation')
        assert continuation['pid'] not in (first['pid'], probe['pid'])
        assert continuation['attempt']['status'] == ('idempotent' if committed else 'committed')
        final = _worker(root, path, case_id + '-final-reopen', probe=True)
        assert final['observed']['userVersion'] == 1001 and final['observed']['originalHash'] == frozen_hash
        return {'requestedFault': fault, 'actualFaultHit': True, 'firstAttempt': first,
                'samePathNewProcess': probe, 'continuation': continuation, 'finalReopen': final,
                'recoveryState': 'committed' if committed else 'transaction rolled back'}

    stages = ['after_schema', 'after_rows', 'before_registry', 'before_commit', 'after_commit']
    number = 10
    for kind in ('error', 'kill'):
        for stage in stages:
            case_id = 'S' + str(number).zfill(2)
            record(case_id, 'real ' + kind + ' at ' + stage + '; same-path new-PID reopen',
                   lambda case_id=case_id, kind=kind, stage=stage: interruption(case_id, kind, stage))
            number += 1

    def wal_backup():
        path = case_copy('S20')
        writer = open_db(root, path, write=True)
        try:
            writer.execute('PRAGMA journal_mode=WAL')
            writer.execute('PRAGMA synchronous=FULL')
            writer.execute('INSERT INTO outbox(id,event) VALUES(900,?)', ('committed WAL event',))
            committed_state = original_dump(writer)
            writer.execute('BEGIN IMMEDIATE')
            writer.execute('INSERT INTO outbox(id,event) VALUES(901,?)', ('uncommitted WAL event',))
            wal = pathlib.Path(str(path) + '-wal')
            assert wal.is_file() and wal.stat().st_size > 0
            wal_bytes = wal.stat().st_size
            manifest = snapshot(root, path, 'S20-active-wal-backup.sqlite')
            copied = open_db(root, 'S20-active-wal-backup.sqlite')
            try:
                assert original_dump(copied) == committed_state
                assert copied.execute('SELECT event FROM outbox WHERE id=900').fetchone()[0] == 'committed WAL event'
                assert not copied.execute('SELECT 1 FROM outbox WHERE id=901').fetchone()
            finally:
                copied.close()
            return {'sqliteVersion': sqlite3.sqlite_version, 'activeWalBytes': wal_bytes,
                    'committedIncluded': True, 'uncommittedExcluded': True, 'manifest': manifest,
                    'scope': 'SQLite backup API only; no production cross-file freeze proof'}
        finally:
            if writer.in_transaction:
                writer.execute('ROLLBACK')
            writer.close()

    record('S20', 'SQLite backup API reads committed active-WAL snapshot', wal_backup)

    def backup_fixture(case_id):
        current = case_copy(case_id)
        original = safe_file(root, 'attachment-original.bin').read_bytes()
        image = _fresh_bytes(root, case_id + '-original-image.bin', original)
        backup = case_id + '-backup.sqlite'
        manifest = snapshot(root, current, backup, [image])
        manifest_path = safe_file(root, backup + '.manifest.json')
        copied_image = safe_file(root, manifest['assets'][0]['path'])
        assert copied_image != image and copied_image.read_bytes() == original
        return current, safe_file(root, backup), copied_image, manifest_path, sha(manifest_path.read_bytes()), manifest

    def valid_backup():
        _, backup, image, manifest_path, trusted, manifest = backup_fixture('S21')
        actual = verify_backup(root, manifest_path, trusted)
        assert actual == manifest and actual['assets'][0]['sha256'] == sha(image.read_bytes())
        assert sha(backup.read_bytes()) == actual['sha256']
        return {'trustedManifestSha256': trusted, 'actualManifest': actual,
                'originalImageBytes': image.stat().st_size, 'assetScope': 'self-contained copied synthetic original bytes; no cross-file production consistency claim'}

    record('S21', 'backup database and original image bytes verified', valid_backup)

    def corrupt_backup(case_id, mode):
        current, backup, image, manifest_path, trusted, _ = backup_fixture(case_id)
        before = _dump(root, current)
        if mode == 'database':
            data = bytearray(backup.read_bytes());data[0] ^= 1;backup.write_bytes(data)
        elif mode == 'manifest':
            manifest_path.write_bytes(manifest_path.read_bytes() + b' ')
        elif mode == 'missing-image':
            safe_file(root, image).unlink()  # exact owned synthetic case file only
        elif mode == 'image':
            data = bytearray(image.read_bytes());data[-1] ^= 1;image.write_bytes(data)
        else:
            raise AssertionError('unknown test mutation')
        rejection = _reject(lambda: verify_backup(root, manifest_path, trusted))
        assert _dump(root, current) == before
        return {'mutation': mode, 'rejection': rejection, 'currentSourceNotOverwritten': True,
                'trustedManifestSha256': trusted}

    record('S22', 'backup database bitflip rejected', lambda: corrupt_backup('S22', 'database'))
    record('S23', 'trusted manifest byte drift rejected', lambda: corrupt_backup('S23', 'manifest'))
    record('S24', 'missing original image rejected', lambda: corrupt_backup('S24', 'missing-image'))
    record('S25', 'original image bitflip rejected', lambda: corrupt_backup('S25', 'image'))

    def unchanged_restore():
        current = case_copy('S26')
        backup = _copy(root, current, 'S26-older-backup.sqlite')
        before = _dump(root, current)
        actual = restore_gate(root, current, backup, REMOTE, REMOTE.copy())
        assert actual == {'eligibleForOfflineCandidate': True, 'automaticActivation': False}
        assert _dump(root, current) == before
        return {'sameLogicalIdentity': True, 'sameFrozenRawState': True,
                'actualDecision': actual, 'productionActivation': False}

    record('S26', 'unchanged backup can only become an offline candidate', unchanged_restore)

    def changed_restore(case_id, mode):
        current = case_copy(case_id)
        backup = _copy(root, current, case_id + '-older-backup.sqlite')
        remote_now = json.loads(json.dumps(REMOTE))
        db = open_db(root, current, write=True)
        try:
            meta = json.loads(db.execute('SELECT value FROM meta WHERE id=1').fetchone()[0])
            if mode == 'event':
                db.execute('INSERT INTO outbox(id,event) VALUES(777,?)', ('new synthetic event after backup',))
            elif mode == 'ack':
                db.execute('DELETE FROM outbox WHERE id<=41')
                meta['cursors']['Synthetic-A'] = 4
                db.execute('UPDATE meta SET value=? WHERE id=1', (json_bytes(meta).decode('utf-8'),))
            elif mode == 'pending':
                meta['pending'] = None
                db.execute('UPDATE meta SET value=? WHERE id=1', (json_bytes(meta).decode('utf-8'),))
            elif mode == 'actor':
                meta['actor'] = 'Synthetic-new-Actor'
                db.execute('UPDATE meta SET value=? WHERE id=1', (json_bytes(meta).decode('utf-8'),))
            elif mode == 'remote':
                remote_now['heads']['Synthetic-A'] = 4
            elif mode == 'epoch':
                remote_now['epoch'] = 'synthetic-new-epoch'
            else:
                raise AssertionError('unknown progress mutation')
        finally:
            db.close()
        before = _dump(root, current)
        before_bytes = sha(current.read_bytes())
        rejection = _reject(lambda: restore_gate(root, current, backup, REMOTE, remote_now), 'BLOCKER')
        assert _dump(root, current) == before and sha(current.read_bytes()) == before_bytes
        assert _dump(root, backup) == frozen
        return {'progress': mode, 'rejection': rejection, 'currentRawStateAndFilePreserved': True,
                'backupStatePreserved': True, 'remoteEvidenceSyntheticOnly': True}

    for case_id, mode in [('S27', 'event'), ('S28', 'ack'), ('S29', 'pending'),
                          ('S30', 'remote'), ('S31', 'epoch'), ('S32', 'actor')]:
        record(case_id, 'older backup blocked after ' + mode + ' progress',
               lambda case_id=case_id, mode=mode: changed_restore(case_id, mode))

    def missing_remote():
        current = case_copy('S33')
        backup = _copy(root, current, 'S33-backup.sqlite')
        before = _dump(root, current)
        rejection = _reject(lambda: restore_gate(root, current, backup, None, None), 'BLOCKER')
        assert _dump(root, current) == before
        return rejection

    record('S33', 'unknown remote evidence cannot authorize restored continuity', missing_remote)

    def no_guard():
        path = case_copy('S34')
        db = open_db(root, path, write=True)
        try:
            db.execute('DROP TABLE d1_synthetic_guard')
        finally:
            db.close()
        before = sha(path.read_bytes())
        rejection = _reject(lambda: migrate(root, path))
        assert sha(path.read_bytes()) == before
        return rejection

    record('S34', 'database without synthetic guard rejected without write', no_guard)

    def outside_path():
        outside = root.parent / 'D1-OUTSIDE-MUST-NOT-CREATE.sqlite'
        existed = outside.exists()
        rejected_file = _reject(lambda: safe_file(root, outside, must_exist=False), 'BLOCKER')
        rejected_root = _reject(lambda: root_path(root.parent), 'BLOCKER')
        assert outside.exists() == existed
        return {'fileRejection': rejected_file, 'rootRejection': rejected_root,
                'outsidePathNotCreated': not existed}

    record('S35', 'outside synthetic root and RUNNER_TEMP itself rejected', outside_path)

    def symlink_path():
        link = safe_file(root, 'S36-linked-source.sqlite', must_exist=False)
        os.symlink(source, link)
        rejection = _reject(lambda: open_db(root, link), 'BLOCKER')
        assert link.is_symlink() and sha(source.read_bytes()) == frozen_bytes_hash
        return {'rejection': rejection, 'originalSourceNotModified': True,
                'linkKeptAsFailureInput': str(link)}

    record('S36', 'symlink database input rejected without following write target', symlink_path)
    record('S37', 'unknown extra source column rejected',
           lambda: unknown_schema('S37', 'ALTER TABLE meta ADD COLUMN synthetic_unknown_column TEXT'))
    record('S38', 'unknown source user_version rejected',
           lambda: unknown_schema('S38', 'PRAGMA user_version=42'))

    def primary_rollback():
        path = case_copy('S39')
        db = open_db(root, path, write=True)
        primary = secondary = None
        try:
            db.execute("CREATE TRIGGER synthetic_primary BEFORE INSERT ON outbox WHEN NEW.id=801 BEGIN SELECT RAISE(ROLLBACK,'synthetic-sql-primary'); END")
            before = original_dump(db)
            db.execute('BEGIN IMMEDIATE')
            db.execute('INSERT INTO outbox(id,event) VALUES(800,?)', ('must rollback',))
            try:
                db.execute('INSERT INTO outbox(id,event) VALUES(801,?)', ('real SQLite rollback trigger',))
            except sqlite3.DatabaseError as error:
                primary = str(error)
                try:
                    db.execute('ROLLBACK')
                except sqlite3.DatabaseError as cleanup:
                    secondary = str(cleanup)
            assert primary == 'synthetic-sql-primary'
            assert secondary is not None and 'no transaction' in secondary.casefold()
            assert not db.in_transaction and original_dump(db) == before
            return {'primaryError': primary, 'actualSecondaryRollbackError': secondary,
                    'triggerHit': True, 'earlierInsertRolledBack': True,
                    'sqliteVersion': sqlite3.sqlite_version,
                    'scope': 'actual independent SQLite errors; no production error-wrapper claim'}
        finally:
            if db.in_transaction:
                db.execute('ROLLBACK')
            db.close()

    record('S39', 'real SQLite RAISE(ROLLBACK) preserves primary and cleanup errors', primary_rollback)

    def source_frozen():
        assert sha(source.read_bytes()) == frozen_bytes_hash
        assert _dump(root, source) == frozen
        return {'sourceDatabase': str(source), 'sourceFileSha256': frozen_bytes_hash,
                'sourceOriginalHash': frozen_hash, 'sourceUnchangedAcrossAllCases': True}

    record('S40', 'all synthetic cases keep platform-generated source frozen', source_frozen)

    def self_contained_assets():
        current, backup, copied, manifest_path, trusted, manifest = backup_fixture('S41')
        original = safe_file(root, manifest['assets'][0]['originalPath'])
        original_hash = sha(original.read_bytes())
        assert original != copied and sha(copied.read_bytes()) == original_hash
        original.unlink()  # exact owned S41 input only; factory original stays intact
        actual = verify_backup(root, manifest_path, trusted)
        assert actual == manifest and sha(copied.read_bytes()) == original_hash
        assert _dump(root, current) == frozen and _dump(root, backup) == frozen
        assert sha(source.read_bytes()) == frozen_bytes_hash
        return {'sourceAssetDeleted': str(original), 'selfContainedAsset': str(copied),
                'selfContainedAssetSha256': original_hash, 'backupVerifiedAfterOriginalRemoval': True,
                'scope': 'self-contained synthetic bytes; no production cross-file freeze guarantee'}

    record('S41', 'self-contained backup remains verifiable after original asset removal', self_contained_assets)
    record('S42', 'candidate projection drift rejected by registered target checksum',
           lambda: drift('S42', 'UPDATE d1_projection SET projection=? WHERE source_key=?',
                         ('{}', fixture['rows'][0]['key'])))
    record('S43', 'source remains frozen after asset independence and target drift cases', source_frozen)


if __name__ == '__main__':
    if len(sys.argv) == 4 and sys.argv[1] == '--probe':
        print(json.dumps(_probe(sys.argv[2], sys.argv[3]), ensure_ascii=False), flush=True)
    else:
        raise SystemExit('Use imported run_storage_cases or cloud-only --probe <root> <sameDatabasePath>')
