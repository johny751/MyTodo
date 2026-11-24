"""Independent synthetic-only tools. Never import a production entry point."""
import hashlib, json, os, pathlib, sqlite3

CANDIDATE = 'd1-01-candidate.1'
GUARD = 'MYTODO_D1_SYNTHETIC_ONLY'

def require_cloud():
    if os.environ.get('GITHUB_ACTIONS') != 'true' or not os.environ.get('GITHUB_RUN_ID', '').isdigit():
        raise RuntimeError('BLOCKER: GitHub Actions synthetic-only execution required')
    return pathlib.Path(os.environ['RUNNER_TEMP']).resolve(strict=True)

def root_path(path, create=False):
    temp = require_cloud()
    p = pathlib.Path(path)
    if not p.is_absolute() or p.is_symlink():
        raise RuntimeError('BLOCKER: absolute non-symlink synthetic root required')
    resolved = p.resolve(strict=False)
    if not resolved.is_relative_to(temp) or resolved == temp:
        raise RuntimeError('BLOCKER: path outside dedicated RUNNER_TEMP root')
    for parent in [p, *p.parents]:
        if parent.is_symlink(): raise RuntimeError('BLOCKER: symlink path')
        if parent.resolve(strict=False) == temp: break
    if create:
        if p.exists(): raise RuntimeError('BLOCKER: refuse pre-existing synthetic root')
        p.mkdir()
    p = p.resolve(strict=True)
    if not p.is_relative_to(temp) or p == temp:
        raise RuntimeError('BLOCKER: path outside dedicated RUNNER_TEMP root')
    marker = p / 'D1-SYNTHETIC.json'
    if create:
        marker.write_text(json.dumps({'guard':GUARD,'runId':os.environ['GITHUB_RUN_ID'],
                                     'candidate':CANDIDATE})+'\n', encoding='utf-8')
    if marker.is_symlink() or not marker.is_file():
        raise RuntimeError('BLOCKER: invalid marker file')
    m = json.loads(marker.read_text(encoding='utf-8'))
    if m != {'guard':GUARD,'runId':os.environ['GITHUB_RUN_ID'],'candidate':CANDIDATE}:
        raise RuntimeError('BLOCKER: wrong run marker')
    return p

def safe_file(root, path, must_exist=True):
    r = root_path(root)
    p = pathlib.Path(path)
    if not p.is_absolute(): p = r / p
    resolved = p.resolve(strict=must_exist)
    if not resolved.is_relative_to(r) or resolved == r or p.is_symlink():
        raise RuntimeError('BLOCKER: outside root or symlink')
    cursor = p.parent
    while cursor != r:
        if cursor.is_symlink(): raise RuntimeError('BLOCKER: symlink ancestor')
        if cursor == cursor.parent: raise RuntimeError('BLOCKER: outside root')
        cursor = cursor.parent
    return resolved

def open_db(root, file, write=False):
    p = safe_file(root, file)
    db = sqlite3.connect(p.as_uri() + ('?mode=rw' if write else '?mode=ro'), uri=True,
                         isolation_level=None)
    db.row_factory = sqlite3.Row
    g = db.execute('SELECT token,fixture_id FROM d1_synthetic_guard').fetchall()
    if len(g)!=1 or g[0]['token']!=GUARD or g[0]['fixture_id']!='synthetic-fixed-v1':
        db.close(); raise RuntimeError('BLOCKER: unmarked database')
    return db

def sha(data): return hashlib.sha256(data).hexdigest()
def json_bytes(value): return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',',':')).encode('utf-8')
def write_json(path,value): pathlib.Path(path).write_bytes(json_bytes(value)+b'\n')

def logical_dump(db):
    """Typed cells and original TEXT bytes; includes all tables and tombstones."""
    result = {}
    for item in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
        table=item[0]
        if not table.replace('_','').isalnum(): raise RuntimeError('BLOCKER: unknown table identifier')
        rows=[]
        for row in db.execute('SELECT * FROM "'+table+'"'):
            values=[]
            for value in row:
                if value is None: values.append(['null',None])
                elif isinstance(value,bytes): values.append(['blob',value.hex()])
                elif isinstance(value,str): values.append(['text',value])
                elif isinstance(value,int): values.append(['integer',value])
                else: values.append(['real',repr(value)])
            rows.append(values)
        result[table]=sorted(rows,key=lambda x:json_bytes(x))
    return result
