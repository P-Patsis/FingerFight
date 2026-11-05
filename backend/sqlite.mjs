import {DatabaseSync} from 'node:sqlite';
export function openDB(filename=':memory:'){
 const db=new DatabaseSync(filename);
 const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values);},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args),success:true};},async run(){return this.runSync();},runSync(){const result=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}};}});
 return {prepare:sql=>wrap(sql),exec:sql=>db.exec(sql),close:()=>db.close(),async batch(statements){db.exec('BEGIN');try{const result=statements.map(statement=>statement.runSync());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}};
}
