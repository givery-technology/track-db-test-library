import * as csv from 'csvjson';
import * as cp from 'child_process';
import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const knex = require('knex') as (config: any) => any;
import * as nodePath from 'path';
import * as util from 'util';
import { text as _ } from './i18n';

const exec = util.promisify(cp.exec);

const NULL_MARKER = '__null__';

export const SQL_ERROR = {
  CHECK: 'check',
  NOT_NULL: 'not_null',
  UNIQUE: 'unique',
  FOREIGN_KEY: 'foreign_key',
  UNKNOWN: 'unknown',
} as const;

function bulk(xs: any[], size: number): any[][] {
  let bulks: any[][] = [];
  for (let i = 0; i < xs.length; i += size) {
    bulks.push(xs.slice(i, i + size));
  }
  return bulks;
}

function flatMap(xs: any[], fn: (x: any) => any[]): any[] {
  return xs.reduce((ys: any[], x: any) => ys.concat(fn(x)));
}

function flatten(xs: any[][]): any[] {
  return flatMap(xs, (x: any) => x);
}

function zipWith(xs: any[], ys: any[]): any[][] {
  let zs: any[][] = [];
  for (let i = 0, length = Math.max(xs.length, ys.length); i < length; i++) {
    zs.push([xs[i], ys[i]]);
  }
  return zs;
}

export function parseSQL(sqls: string): string[] {
  return sqls
    .replace(/\/\*.*?\*\//gms, '')
    .replace(/--[^\n]*$/gm, '')
    .split(/;\n?/)
    .map((sql: string) => sql.trim())
    .filter((sql: string) => sql.length !== 0);
}

async function parseSQLFromFile(path: string): Promise<string[]> {
  const sqls = await util.promisify(fs.readFile)(path, { encoding: 'utf8' });
  return parseSQL(sqls);
}

function typeOf(x: any): string {
  return Object.prototype.toString.call(x).slice(8, -1).toLowerCase();
}

async function sleep(ms: number): Promise<void> {
  return new Promise((res) => {
    setTimeout(() => res(), ms);
  });
}

class SQLiteCasette {
  async newConnection(options: any): Promise<any> {
    const dbfile = (options || {}).file || 'db.sqlite';
    if (options && options.clean) {
      try {
        await fs.promises.unlink(dbfile);
      } catch (_e) { /* ignores any error */ }
    }
    return knex({
      client: 'sqlite3',
      connection: { filename: dbfile },
      useNullAsDefault: true
    });
  }
  rows(result: any): any {
    return result;
  }
  explainSql(s: string): string {
    return `EXPLAIN QUERY PLAN ${s}`;
  }
  tableSchemaSql(): string {
    return `
      SELECT
        cid + 1 AS 'order',
        name,
        type AS raw_type
      FROM pragma_table_info(?)
      ORDER BY cid
    `;
  }
  updateAutoIncrementSql(table: string, _column: string): string {
    return `UPDATE sqlite_sequence SET seq = ? WHERE name = '${table}'`;
  }
  lastValueSql(table: string, idCol: string): string {
    return `SELECT * FROM ${table} WHERE ${idCol} = last_insert_rowid()`;
  }
  async listFk(table: string, conn: Connection): Promise<any[]> {
    const schema = await conn.query(`
      SELECT sql FROM sqlite_master WHERE type = 'table' AND name = '${table}'
    `);
    if (schema.length === 0) {
      return [];
    }
    const schemaSql = schema[0].sql;
    const re = new RegExp('foreign\\s+key\\s*\\(([^)]+)\\)\\s*references\\s+([^)]+)\\s*\\(([^)]+)\\)', 'ig');
    const ms = schemaSql.matchAll(re);
    const result: any[] = [];
    for (const m of ms) {
      const columns = m[1].split(',').map((c: string) => c.trim());
      const foreign_columns = m[3].split(',').map((c: string) => c.trim());
      columns.forEach((column: string) => {
        foreign_columns.forEach((foreign_column: string) => {
          result.push({ column, foreign_table: m[2], foreign_column });
        });
      });
    }
    return result;
  }
  errorOf(e: any): [string, string?] {
    if (/SQLITE_CONSTRAINT: NOT NULL/.test(e.stack)) {
      return [SQL_ERROR.NOT_NULL];
    } else if (/SQLITE_CONSTRAINT: UNIQUE/.test(e.stack)) {
      return [SQL_ERROR.UNIQUE];
    } else if (/SQLITE_CONSTRAINT: CHECK/.test(e.stack)) {
      const xs = e.stack.split(':').map((s: string) => s.trim());
      const claim = xs[xs.length - 1];
      return [SQL_ERROR.CHECK, claim];
    } else if (/SQLITE_CONSTRAINT: FOREIGN KEY/.test(e.stack)) {
      return [SQL_ERROR.FOREIGN_KEY];
    } else {
      return [SQL_ERROR.UNKNOWN];
    }
  }
}

class PostgreSQLCasette {
  async newConnection(options: any): Promise<any> {
    for (let retries = 10; retries > 0; retries--) {
      try {
        await exec('service postgresql start');
        const conn = knex({
          client: 'pg',
          connection: {
            host: '127.0.0.1',
            port: 5432,
            user: 'track',
            password: 'password',
            database: 'track',
          },
        });
        await conn.raw("SELECT 1");
        if (options && options.clean) {
          try {
            let tables = await conn.raw("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
            for (let table of tables.rows) {
              await conn.raw(`DROP TABLE IF EXISTS ${table.tablename} CASCADE`);
            }
            let sequences = await conn.raw("SELECT c.relname FROM pg_class c LEFT join pg_user u ON c.relowner = u.usesysid WHERE c.relkind = 'S'");
            for (let sequence of sequences.rows) {
              await conn.raw(`DROP SEQUENCE ${sequence.relname}`);
            }
          } catch (e2) { console.error(e2); }
        }
        return conn;
      } catch (e) {
        await sleep(500);
      }
    }
    throw Error("Failed to start PostgreSQL server");
  }
  rows(result: any): any {
    return result.rows;
  }
  explainSql(s: string): string {
    return `EXPLAIN ${s}`;
  }
  tableSchemaSql(): string {
    return `
      SELECT
        ordinal_position AS "order",
        column_name AS name,
        data_type AS raw_type
      FROM information_schema.columns
      WHERE
        table_schema = 'public' AND
        table_name = ?
      ORDER BY ordinal_position
    `;
  }
  updateAutoIncrementSql(table: string, column: string): string {
    return `SELECT SETVAL('${table}_${column}_seq', ?, true)`;
  }
  lastValueSql(table: string, idCol: string): string {
    return `SELECT * FROM ${table} WHERE ${idCol} = LASTVAL()`;
  }
  async listFk(table: string, conn: Connection): Promise<any[]> {
    return await conn.query(`
      SELECT
        kcu.column_name AS column,
        ccu.table_name AS foreign_table,
        ccu.column_name AS foreign_column
      FROM information_schema.table_constraints AS tc
      INNER JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
      INNER JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = '${table}'
    `);
  }
  errorOf(_e: any): [string] {
    return [SQL_ERROR.UNKNOWN];
  }
}

class MySQLCassette {
  async newConnection(options: any): Promise<any> {
    for (let retries = 10; retries > 0; retries--) {
      try {
        await exec('service mysql start');
        const conn = knex({
          client: 'mysql',
          connection: {
            host: '127.0.0.1',
            port: 3306,
            user: 'track',
            password: 'password',
            database: 'track',
          },
        });
        await conn.raw("SELECT 1");
        if (options && options.clean) {
          try {
            let tables = await conn.raw("SHOW TABLES");
            await conn.raw("SET foreign_key_checks = 0");
            for (let table of tables[0]) {
              await conn.raw(`DROP TABLE IF EXISTS ${table.Tables_in_track}`);
            }
            await conn.raw("SET foreign_key_checks = 1");
          } catch (e2) { console.error(e2); }
        }
        return conn;
      } catch (e) {
        await sleep(500);
      }
    }
    throw Error("Failed to start MySQL server");
  }
  rows(result: any): any {
    return result[0];
  }
  explainSql(s: string): string {
    return `EXPLAIN ${s}`;
  }
  tableSchemaSql(): string {
    return `
      SELECT
        ordinal_position AS "order",
        column_name AS name,
        data_type AS raw_type
      FROM information_schema.columns
      WHERE
        table_schema = 'track' AND
        table_name = ?
      ORDER BY ordinal_position
    `;
  }
  updateAutoIncrementSql(table: string, _column: string): string {
    return `ALTER TABLE ${table} AUTO_INCREMENT = ?`;
  }
  lastValueSql(table: string, idCol: string): string {
    return `SELECT * FROM ${table} WHERE ${idCol} = LAST_INSERT_ID()`;
  }
  async listFk(table: string, conn: Connection): Promise<any[]> {
    return await conn.query(`
      SELECT
        COLUMN_NAME AS \`column\`,
        REFERENCED_TABLE_NAME AS foreign_table,
        REFERENCED_COLUMN_NAME AS foreign_column
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE
        TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = '${table}'
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `);
  }
  errorOf(_e: any): [string] {
    return [SQL_ERROR.UNKNOWN];
  }
}

/**
 * Handles connection
 */
export class Connection {
  static util = { parseSQL };
  static SQL_ERROR = SQL_ERROR;

  private _conn: any;
  private _cassette: any;
  private _options: any;

  static timeout(client: string | undefined, extra?: number): number {
    switch (client) {
      case "pg":
      case "postgres":
      case "postgresql":
        return 12000 + (extra || 0);
      case "my":
      case "mysql":
        return 12000 + (extra || 0);
      default:
        return 2000 + (extra || 0);
    }
  }

  static async new(options?: any): Promise<Connection> {
    let casette: any;
    switch ((options || {}).client) {
      case "pg":
      case "postgres":
      case "postgresql":
        casette = new PostgreSQLCasette();
        break;
      case "my":
      case "mysql":
        casette = new MySQLCassette();
        break;
      default:
        casette = new SQLiteCasette();
        break;
    }

    let conn = await casette.newConnection(options);
    return new Connection(conn, casette, options);
  }

  constructor(conn: any, casette?: any, options?: any) {
    // Legacy mode
    if (!casette || !casette.newConnection) {
      this._initLegacy(conn, casette);
      return;
    }

    // New mode
    this._conn = conn;
    this._cassette = casette;
    this._options = options ?? {};
  }

  get casette(): any {
    return this._cassette;
  }

  get conn(): any {
    return this._conn;
  }

  destroy(): void {
    this._conn.context.destroy();
  }

  private _initLegacy(tx: any, options: any): void {
    if (!!tx && !tx.transaction) {
      options = tx;
      tx = null;
    }
    const dbfile = (options || {}).file || 'db.sqlite';
    if (options && options.clean) {
      try {
        fs.unlinkSync(dbfile);
      } catch (_e) { /* ignores any error */ }
    }
    this._conn = tx || knex({
      client: 'sqlite3',
      connection: { filename: dbfile },
      useNullAsDefault: true
    });
    this._cassette = new SQLiteCasette();
    this._options = options ?? {};
  }

  async queryAll(queries: string[]): Promise<any[]> {
    let results: any[] = [];
    for (let query of queries) {
      let [a, b] = query.split(':').map((s: string) => s.trim());
      if (!!b && a.endsWith('.csv')) {
        const table = b || a.replace('.csv', '');
        results.push({
          type: 'csv',
          table,
          records: await this.loadFromCSV(nodePath.join(process.cwd(), a), table),
        });
      } else if (a.endsWith('.sql')) {
        const args = !!b ? b.split(',')
          .map((s: string) => s.trim())
          .map((s: string) => s === NULL_MARKER ? null : s)
          : undefined;
        (await this.queryFromFile(nodePath.join(process.cwd(), a), args))
          .forEach((r: any) => results.push({
            type: 'sql',
            sql: r.sql,
            records: r.records,
          }));
      } else {
        results.push({
          type: 'sql',
          sql: query,
          records: await this.query(query),
        });
      }
    }
    return results;
  }

  async prepare(queries: any): Promise<any> {
    if (typeOf(queries) !== 'array') {
      return (await this.prepare([queries]))[0];
    }
    let result: any[] = [];
    for (let query of queries) {
      if (!query) {
        result.push(null);
        continue;
      }
      let q: string, r: any;
      if (typeOf(query) === 'string') {
        q = query;
      } else {
        q = query.sql || query.path;
        r = query.args || query.table;
      }
      if (q.endsWith('.sql')) {
        result.push(await this.queryFromFile(q));
      } else if (q.endsWith('.csv')) {
        result.push(await this.loadFromCSV(q, r));
      } else {
        result.push(await this.query(q, r));
      }
    }
    return result;
  }

  get knex(): any {
    return this._conn;
  }

  async close(): Promise<void> {
    await this._conn.destroy();
  }

  async query(sql: string, opt_args?: any): Promise<any[]> {
    if (sql.trim().length === 0) {
      throw 'Empty query';
    }

    const isSelectStatement = /^\s*SELECT /i.test(sql);
    if (isSelectStatement) {
      const count = this._cassette.rows(await this._conn.raw(`SELECT count(1) AS count FROM (${sql.replace(/;\s*$/, "")}) AS x`, opt_args)).length;
      if (count > (this._options.maxRows || 10000)) {
        throw 'Too many records';
      }
    }

    return this._cassette.rows(await this._conn.raw(sql, opt_args));
  }

  async queryPlan(sql: string, opt_args?: any): Promise<any[]> {
    const explainSql = this._cassette.explainSql(sql);
    return await this.query(explainSql, opt_args);
  }

  async queryFromFile(path: string, opt_args?: any): Promise<any[]> {
    const sqls = await parseSQLFromFile(path);
    const result: any[] = [];
    let i = 0, j = 0;
    opt_args = opt_args || [];
    for (let sql of sqls) {
      if (sql.includes('?')) {
        j += (sql.match(/\?/g) || []).length;
        const args = opt_args.slice(i, j);
        i = j;
        const records = await this.query(sql, args);
        result.push({ sql, records });
      } else {
        const records = await this.query(sql);
        result.push({ sql, records });
      }
    }
    return result;
  }

  async queryPlanFromFile(path: string, opt_args?: any[]): Promise<any[]> {
    const sqls = await parseSQLFromFile(path);
    return await Promise.all(
      zipWith(sqls, opt_args || [])
        .map((sa: any[]) => {
          const explainSql = this._cassette.explainSql(sa[0]);
          return this.query(explainSql, sa[1])
            .then((records: any) => ({ sql: explainSql, records: records }));
        })
    );
  }

  async loadFromCSV(path: string, table: string): Promise<any[]> {
    const s = await util.promisify(fs.readFile)(path, { encoding: 'utf8' });
    const objs = csv.toObject(s);
    objs.forEach((obj: any) => {
      for (let i in obj) {
        if (!obj.hasOwnProperty(i)) {
          continue;
        }
        if (obj[i] === NULL_MARKER) {
          obj[i] = null;
        }
      }
    });
    const bulkGroups = bulk(objs, 50);
    const rs = await Promise.all(
      bulkGroups.map((b: any[]) => this._conn.insert(b).into(table))
    );
    return rs.flatMap((r: any) => this._cassette.rows(r));
  }

  async dryrun(fn: (conn: Connection) => Promise<any>): Promise<any> {
    const tx = await this._conn.transaction();
    const child = new Connection(tx);
    try {
      const result = await fn(child);
      await tx.rollback().catch((r: any) => r);
      return result;
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  }

  async tableSchema(table: string): Promise<any[]> {
    const sql = this._cassette.tableSchemaSql();
    const result = await this.query(sql, [table]);
    result.forEach((r: any) => r.fks = []);
    const fks = await this._cassette.listFk(table, this);
    fks.forEach(({ column, foreign_table, foreign_column }: any) => {
      result
        .filter((r: any) => r.name === column)
        .forEach((r: any) => r.fks.push({
          table: foreign_table,
          column: foreign_column,
        }));
    });
    return result;
  }

  async updateAutoIncrement(table: string, column: string, count: number): Promise<any> {
    const sql = this._cassette.updateAutoIncrementSql(table, column);
    if (this._cassette instanceof MySQLCassette) {
      count = (count || 0) + 1;
    }
    return await this.query(sql, [count]);
  }

  async lastValue(table: string, idCol: string): Promise<any[]> {
    try {
      return await this.query(this._cassette.lastValueSql(table, idCol));
    } catch (e) {
      return [];
    }
  }

  errorOf(e: any): any {
    return this._cassette.errorOf(e);
  }
}

export default Connection;
