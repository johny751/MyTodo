"""Read-only authentication of one Android Framework-owned synthetic table.

This is a fixture-domain allowance, never a production schema whitelist.
"""
import os
import pathlib
import re

from candidate import parse_raw
from isolation import CANDIDATE, GUARD, open_db, root_path, safe_file, sha

FIXTURE = 'synthetic-fixed-v1'
TABLE = 'android_metadata'
DDL = 'CREATE TABLE android_metadata (locale TEXT)'
SEALED_NAMES = {'android-source.sqlite', 'feedback-source.sqlite', 'feedback-validation.sqlite'}
TABLE_INFO = [{'cid': 0, 'name': 'locale', 'type': 'TEXT', 'notnull': 0, 'dfltValue': None, 'pk': 0}]


def blocked(reason):
    raise RuntimeError('BLOCKER: Android Framework metadata ' + reason)


def observe(db):
    objects = []
    for row in db.execute('SELECT type,name,tbl_name,sql,typeof(sql),CAST(sql AS BLOB) '
                          'FROM sqlite_master WHERE name=? OR tbl_name=? ORDER BY type,name', (TABLE, TABLE)):
        raw = row[5]
        objects.append({'type': row[0], 'name': row[1], 'tblName': row[2], 'sql': row[3],
                        'sqlStorageClass': row[4], 'sqlUtf8Hex': raw.hex() if raw is not None else None,
                        'sqlUtf8Sha256': sha(raw) if raw is not None else None})
    info = [dict(row) for row in db.execute('PRAGMA table_info(android_metadata)')]
    info = [{'cid': x['cid'], 'name': x['name'], 'type': x['type'], 'notnull': x['notnull'],
             'dfltValue': x['dflt_value'], 'pk': x['pk']} for x in info]
    locale = []
    if len(info) == 1 and info[0]['name'] == 'locale' and any(x['type'] == 'table' for x in objects):
        for row in db.execute('SELECT typeof(locale),CAST(locale AS BLOB) FROM android_metadata'):
            raw = row[1]
            locale.append({'storageClass': row[0], 'utf8Hex': raw.hex() if raw is not None else None,
                           'utf8Sha256': sha(raw) if raw is not None else None,
                           'bytes': len(raw) if raw is not None else None})
    return {'schemaObjects': objects, 'tableInfo': info, 'localeRows': locale}


def exact_shape(value):
    """Only the specified table, column and a single typed original locale row."""
    objects = value.get('schemaObjects')
    if not isinstance(objects, list) or len(objects) != 1:
        blocked('requires exactly one table object; indexes/triggers/views are forbidden')
    item = objects[0]
    expected = {'type': 'table', 'name': TABLE, 'tblName': TABLE, 'sql': DDL,
                'sqlStorageClass': 'text', 'sqlUtf8Hex': DDL.encode('utf-8').hex(),
                'sqlUtf8Sha256': sha(DDL.encode('utf-8'))}
    if any(item.get(key) != val for key, val in expected.items()):
        blocked('exact DDL or original SQL bytes differ')
    info = value.get('tableInfo')
    if info != TABLE_INFO or any(type(info[0].get(key)) is not int for key in ('cid', 'notnull', 'pk')):
        blocked('requires one exact locale TEXT column')
    rows = value.get('localeRows')
    if not isinstance(rows, list) or len(rows) != 1 or rows[0].get('storageClass') != 'text':
        blocked('requires one TEXT locale row')
    row = rows[0]
    text = row.get('utf8Hex')
    if not isinstance(text, str) or not re.fullmatch(r'(?:[a-f0-9]{2})*', text):
        blocked('invalid original locale hex')
    raw = bytes.fromhex(text)
    try:
        raw.decode('utf-8', 'strict')
    except UnicodeError:
        blocked('locale is not valid original UTF-8 TEXT')
    if type(row.get('bytes')) is not int or row['bytes'] != len(raw) or row.get('utf8Sha256') != sha(raw):
        blocked('original locale byte length/hash differ')
    return {'schemaObjects': [expected], 'tableInfo': TABLE_INFO, 'localeRows': [
        {'storageClass': 'text', 'utf8Hex': text, 'utf8Sha256': sha(raw), 'bytes': len(raw)}]}


def capture_gate(seal, runner, sealed_name):
    if type(runner.get('exitCode')) is not int or runner['exitCode'] != 0:
        blocked('runner exit code is not an actual successful integer zero')
    names = {sealed_name + suffix for suffix in ('-wal', '-shm', '-journal')}
    sidecars = seal.get('sidecars')
    if not isinstance(sidecars, list) or len(sidecars) != 3 or any(not isinstance(x, dict) for x in sidecars):
        blocked('closed-file sidecar seal must contain exactly three objects')
    if {x.get('name') for x in sidecars} != names:
        blocked('closed-file sidecar names are missing, duplicated or unexpected')
    for item in sidecars:
        if type(item.get('exists')) is not bool or type(item.get('bytes')) is not int or item['bytes'] != 0:
            blocked('closed-file sidecar existence/type/size is contradictory')
    all_probes = runner.get('sidecarProbes')
    if not isinstance(all_probes, list) or any(not isinstance(x, dict) for x in all_probes):
        blocked('runner sidecar frames are missing')
    probes = [x for x in all_probes if x.get('fileName') in names]
    if len(probes) != 3 or {x.get('fileName') for x in probes} != names:
        blocked('runner sidecar frame identity is missing or duplicated')
    for probe in probes:
        if probe.get('remotePath') != 'files/d1-fixtures/' + probe['fileName']:
            blocked('runner sidecar frame path mismatch')
        if probe.get('allowed') is not True or probe.get('completeFrame') is not True:
            blocked('runner sidecar frame did not pass the complete-frame gate')
        if probe.get('transport') != 'adb-shell-v2-stdin-no-pty':
            blocked('runner sidecar frame has the wrong transport')
        for key in ('hostExitCode', 'remoteProbeRc', 'stderrBytes'):
            if type(probe.get(key)) is not int or probe[key] != 0:
                blocked('runner sidecar frame has an unsuccessful/invalid ' + key)
        if probe.get('timedOut') is not False or probe.get('sizeLimit') is not False:
            blocked('runner sidecar frame timed out or exceeded its limit')
        if any(key not in probe or probe[key] is not None for key in ('stdinError', 'hostSignal', 'spawnError')):
            blocked('runner sidecar frame has a transport error/signal')
        if probe.get('probeRcText') != '0' or probe.get('stateText') != probe.get('state'):
            blocked('runner sidecar raw frame fields contradict its parsed state')
        if probe.get('state') == 'ABSENT':
            if probe.get('remoteStatRc') is not None or probe.get('size') is not None or probe.get('statRcText') != 'NA' or probe.get('sizeText') != 'NA':
                blocked('absent runner sidecar frame is contradictory')
        elif probe.get('state') == 'PRESENT':
            if any(type(probe.get(key)) is not int or probe[key] != 0 for key in ('remoteStatRc', 'size')) or probe.get('statRcText') != '0' or probe.get('sizeText') != '0':
                blocked('present runner sidecar must have successful stat and zero bytes')
        else:
            blocked('runner sidecar frame is neither absent nor present-empty')


def authority(root, sealed_name):
    r = root_path(root)
    # The current fixture harness has explicit android/windows/node source
    # roles. Directory role alone never authorizes this table: all independent
    # generator, runner, current-run and immutable original-file proofs follow.
    if r.name != 'android' or sealed_name not in SEALED_NAMES:
        blocked('forbidden outside the explicit Android source profile/role')
    if any((r / name).exists() for name in ('native-generator-receipt.json', 'node-generator-receipt.json')):
        blocked('native C/Node profile cannot acquire a Framework allowance')
    generator = parse_raw(safe_file(r, 'android-generator-receipt.json').read_text(encoding='utf-8'))
    runner = parse_raw(safe_file(r, 'android-runner-receipt.json').read_text(encoding='utf-8'))
    fixture = safe_file(r, 'fixture.json')
    fixture_hash = sha(fixture.read_bytes())
    for value in (generator, runner):
        for key, expected in [('status', 'passed'), ('guard', GUARD), ('candidate', CANDIDATE),
                              ('runId', os.environ['GITHUB_RUN_ID']), ('fixtureId', FIXTURE),
                              ('fixtureSha256', fixture_hash), ('actualFramework', True),
                              ('actualProductionEntryLoaded', False)]:
            if type(value.get(key)) is not type(expected) or value.get(key) != expected:
                blocked('generator/runner identity or qualification mismatch: ' + key)
    build = generator.get('buildMetadata', {})
    for value in (build, runner):
        for key in ('sourceSha', 'runId', 'runAttempt'):
            expected = os.environ[{'sourceSha': 'GITHUB_SHA', 'runId': 'GITHUB_RUN_ID',
                                   'runAttempt': 'GITHUB_RUN_ATTEMPT'}[key]]
            if value.get(key) != expected:
                blocked('current source/run/attempt mismatch: ' + key)
    java = pathlib.Path(__file__).parent / 'android' / 'FixtureInstrumentation.java'
    if build.get('sources', {}).get('FixtureInstrumentation.java') != sha(java.read_bytes()):
        blocked('independent Java source identity mismatch')
    seal = generator.get('files', {}).get(sealed_name)
    original = safe_file(r, sealed_name)
    raw = original.read_bytes()
    if not isinstance(seal, dict) or seal.get('writersClosed') is not True:
        blocked('missing closed original database file seal')
    capture_gate(seal, runner, sealed_name)
    if seal.get('bytes') != len(raw) or seal.get('sha256') != sha(raw):
        blocked('original database bytes do not match Java seal')
    if runner.get('outputs', {}).get(sealed_name) != {'bytes': len(raw), 'sha256': sha(raw)}:
        blocked('runner capture does not match original database seal')
    framework = seal.get('frameworkSchema', {})
    for key in ('metadataTablePresent', 'localeColumnPresent', 'localeRowsRead', 'observationOnly'):
        if framework.get(key) is not True:
            blocked('missing original Framework observation: ' + key)
    expected = exact_shape(framework)
    related = [x for x in seal.get('sqliteMasterObjects', [])
               if x.get('name') == TABLE or x.get('tblName') == TABLE]
    if related != framework.get('schemaObjects'):
        blocked('all-object seal and Framework object evidence disagree')
    db = open_db(r, original)
    try:
        if exact_shape(observe(db)) != expected:
            blocked('Java schema/typed locale evidence differs from sealed original database')
    finally:
        db.close()
    return expected, {'profile': 'android', 'sealedSourceRole': sealed_name,
                      'originalSourceSha256': sha(raw), 'generatorSha256': sha(safe_file(r, 'android-generator-receipt.json').read_bytes()),
                      'runnerSha256': sha(safe_file(r, 'android-runner-receipt.json').read_bytes())}


def framework_domain(root, db, sealed_name='android-source.sqlite', authority_root=None):
    r = root_path(authority_root or root)
    observed = observe(db)
    has_proof = any((r / name).exists() for name in ('android-generator-receipt.json', 'android-runner-receipt.json'))
    if not observed['schemaObjects'] and not has_proof:
        return {'tables': [], 'profile': 'non-Android', 'frameworkPresent': False}
    expected, provenance = authority(r, sealed_name)
    actual = exact_shape(observed)
    if actual != expected:
        blocked('candidate/backup metadata differs from original Java typed locale evidence')
    return {'tables': [TABLE], 'frameworkPresent': True, 'observation': actual, 'authority': provenance}
