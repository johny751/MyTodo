// Test-only SQL plans. Every statement is executed by the actual production SQLite handle.
export const identifiers = new Set(['meta','entities','outbox']);
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
export function sqlFaultPlan(spec = {}) {
  const kind = spec.kind || 'none', table = spec.table || 'meta';
  if (!identifiers.has(table)) throw Error('C007 fault table is not allowed');
  if (kind === 'none') return {kind,statements:[]};
  if (['update-abort','insert-abort','delete-abort'].includes(kind)) {
    const verb = kind.split('-')[0].toUpperCase();
    const predicate = spec.id == null ? '' : table === 'entities' && verb !== 'DELETE'
      ? ' WHEN NEW.id=' + literal(spec.id) : (()=>{throw Error('id selector is restricted to entity insert/update');})();
    return {kind,statements:[`CREATE TEMP TRIGGER c007_abort BEFORE ${verb} ON main.${table}${predicate} BEGIN SELECT c007_fault_hit(); SELECT RAISE(ABORT,'C007_SQL_STEP_ABORT'); END`]};
  }
  if (kind === 'prepare-fail' || kind === 'read-overflow') {
    // Missing function is a real SQLite prepare failure. abs(INT64_MIN) is evaluated by SQLite at step.
    const bad = kind === 'prepare-fail' ? 'c007_missing_function()' : 'abs(-9223372036854775808)';
    let columns;
    if (table === 'meta') columns = `id,CASE WHEN id=1 THEN ${bad} ELSE value END AS value`;
    else if (table === 'outbox') columns = `id,CASE WHEN id=${Number.isSafeInteger(spec.rowId)?spec.rowId:1} THEN ${bad} ELSE event END AS event`;
    else {
      if (typeof spec.id !== 'string' || !spec.id) throw Error('Entity read fault requires an existing fixture id');
      columns = `key,kind,id,CASE WHEN id=${literal(spec.id)} THEN ${bad} ELSE data END AS data,record,deleted,conflicts,parent_id,done,quadrant,reminder_at,start`;
    }
    return {kind,statements:[`CREATE TEMP VIEW ${table} AS SELECT ${columns} FROM main.${table}`]};
  }
  if (kind === 'commit-deferred-fk') return {kind,foreignKeys:true,statements:[
    'CREATE TABLE c007_parent(id INTEGER PRIMARY KEY)',
    'CREATE TABLE c007_child(id INTEGER REFERENCES c007_parent(id) DEFERRABLE INITIALLY DEFERRED)',
    "CREATE TEMP TRIGGER c007_deferred AFTER UPDATE ON main.meta BEGIN SELECT c007_fault_hit(); INSERT INTO c007_child(id) VALUES(1); END",
  ]};
  throw Error('Unknown C007 real SQL fault: ' + kind);
}
export function clearSqlFaults(db) {
  db.exec('DROP TRIGGER IF EXISTS temp.c007_abort; DROP TRIGGER IF EXISTS temp.c007_deferred; DROP VIEW IF EXISTS temp.meta; DROP VIEW IF EXISTS temp.entities; DROP VIEW IF EXISTS temp.outbox; DROP TABLE IF EXISTS c007_child; DROP TABLE IF EXISTS c007_parent;');
}
