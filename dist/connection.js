"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Connection = exports.SQL_ERROR = void 0;
exports.parseSQL = parseSQL;
const csv = __importStar(require("csvjson"));
const cp = __importStar(require("child_process"));
const fs = __importStar(require("fs"));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const knex = require('knex');
const nodePath = __importStar(require("path"));
const util = __importStar(require("util"));
const exec = util.promisify(cp.exec);
const NULL_MARKER = '__null__';
exports.SQL_ERROR = {
    CHECK: 'check',
    NOT_NULL: 'not_null',
    UNIQUE: 'unique',
    FOREIGN_KEY: 'foreign_key',
    UNKNOWN: 'unknown',
};
function bulk(xs, size) {
    let bulks = [];
    for (let i = 0; i < xs.length; i += size) {
        bulks.push(xs.slice(i, i + size));
    }
    return bulks;
}
function flatMap(xs, fn) {
    return xs.reduce((ys, x) => ys.concat(fn(x)));
}
function flatten(xs) {
    return flatMap(xs, (x) => x);
}
function zipWith(xs, ys) {
    let zs = [];
    for (let i = 0, length = Math.max(xs.length, ys.length); i < length; i++) {
        zs.push([xs[i], ys[i]]);
    }
    return zs;
}
function parseSQL(sqls) {
    return sqls
        .replace(/\/\*.*?\*\//gms, '')
        .replace(/--[^\n]*$/gm, '')
        .split(/;\n?/)
        .map((sql) => sql.trim())
        .filter((sql) => sql.length !== 0);
}
async function parseSQLFromFile(path) {
    const sqls = await util.promisify(fs.readFile)(path, { encoding: 'utf8' });
    return parseSQL(sqls);
}
function typeOf(x) {
    return Object.prototype.toString.call(x).slice(8, -1).toLowerCase();
}
async function sleep(ms) {
    return new Promise((res) => {
        setTimeout(() => res(), ms);
    });
}
class SQLiteCasette {
    async newConnection(options) {
        const dbfile = (options || {}).file || 'db.sqlite';
        if (options && options.clean) {
            try {
                await fs.promises.unlink(dbfile);
            }
            catch (_e) { /* ignores any error */ }
        }
        return knex({
            client: 'sqlite3',
            connection: { filename: dbfile },
            useNullAsDefault: true
        });
    }
    rows(result) {
        return result;
    }
    explainSql(s) {
        return `EXPLAIN QUERY PLAN ${s}`;
    }
    tableSchemaSql() {
        return `
      SELECT
        cid + 1 AS 'order',
        name,
        type AS raw_type
      FROM pragma_table_info(?)
      ORDER BY cid
    `;
    }
    updateAutoIncrementSql(table, _column) {
        return `UPDATE sqlite_sequence SET seq = ? WHERE name = '${table}'`;
    }
    lastValueSql(table, idCol) {
        return `SELECT * FROM ${table} WHERE ${idCol} = last_insert_rowid()`;
    }
    async listFk(table, conn) {
        const schema = await conn.query(`
      SELECT sql FROM sqlite_master WHERE type = 'table' AND name = '${table}'
    `);
        if (schema.length === 0) {
            return [];
        }
        const schemaSql = schema[0].sql;
        const re = new RegExp('foreign\\s+key\\s*\\(([^)]+)\\)\\s*references\\s+([^)]+)\\s*\\(([^)]+)\\)', 'ig');
        const ms = schemaSql.matchAll(re);
        const result = [];
        for (const m of ms) {
            const columns = m[1].split(',').map((c) => c.trim());
            const foreign_columns = m[3].split(',').map((c) => c.trim());
            columns.forEach((column) => {
                foreign_columns.forEach((foreign_column) => {
                    result.push({ column, foreign_table: m[2], foreign_column });
                });
            });
        }
        return result;
    }
    errorOf(e) {
        if (/SQLITE_CONSTRAINT: NOT NULL/.test(e.stack)) {
            return [exports.SQL_ERROR.NOT_NULL];
        }
        else if (/SQLITE_CONSTRAINT: UNIQUE/.test(e.stack)) {
            return [exports.SQL_ERROR.UNIQUE];
        }
        else if (/SQLITE_CONSTRAINT: CHECK/.test(e.stack)) {
            const xs = e.stack.split(':').map((s) => s.trim());
            const claim = xs[xs.length - 1];
            return [exports.SQL_ERROR.CHECK, claim];
        }
        else if (/SQLITE_CONSTRAINT: FOREIGN KEY/.test(e.stack)) {
            return [exports.SQL_ERROR.FOREIGN_KEY];
        }
        else {
            return [exports.SQL_ERROR.UNKNOWN];
        }
    }
}
class PostgreSQLCasette {
    async newConnection(options) {
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
                    }
                    catch (e2) {
                        console.error(e2);
                    }
                }
                return conn;
            }
            catch (e) {
                await sleep(500);
            }
        }
        throw Error("Failed to start PostgreSQL server");
    }
    rows(result) {
        return result.rows;
    }
    explainSql(s) {
        return `EXPLAIN ${s}`;
    }
    tableSchemaSql() {
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
    updateAutoIncrementSql(table, column) {
        return `SELECT SETVAL('${table}_${column}_seq', ?, true)`;
    }
    lastValueSql(table, idCol) {
        return `SELECT * FROM ${table} WHERE ${idCol} = LASTVAL()`;
    }
    async listFk(table, conn) {
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
    errorOf(_e) {
        return [exports.SQL_ERROR.UNKNOWN];
    }
}
class MySQLCassette {
    async newConnection(options) {
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
                    }
                    catch (e2) {
                        console.error(e2);
                    }
                }
                return conn;
            }
            catch (e) {
                await sleep(500);
            }
        }
        throw Error("Failed to start MySQL server");
    }
    rows(result) {
        return result[0];
    }
    explainSql(s) {
        return `EXPLAIN ${s}`;
    }
    tableSchemaSql() {
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
    updateAutoIncrementSql(table, _column) {
        return `ALTER TABLE ${table} AUTO_INCREMENT = ?`;
    }
    lastValueSql(table, idCol) {
        return `SELECT * FROM ${table} WHERE ${idCol} = LAST_INSERT_ID()`;
    }
    async listFk(table, conn) {
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
    errorOf(_e) {
        return [exports.SQL_ERROR.UNKNOWN];
    }
}
/**
 * Handles connection
 */
class Connection {
    static timeout(client, extra) {
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
    static async new(options) {
        let casette;
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
    constructor(conn, casette, options) {
        // Legacy mode
        if (!casette || !casette.newConnection) {
            this._initLegacy(conn, casette);
            return;
        }
        // New mode
        this._conn = conn;
        this._cassette = casette;
        this._options = options !== null && options !== void 0 ? options : {};
    }
    get casette() {
        return this._cassette;
    }
    get conn() {
        return this._conn;
    }
    destroy() {
        this._conn.context.destroy();
    }
    _initLegacy(tx, options) {
        if (!!tx && !tx.transaction) {
            options = tx;
            tx = null;
        }
        const dbfile = (options || {}).file || 'db.sqlite';
        if (options && options.clean) {
            try {
                fs.unlinkSync(dbfile);
            }
            catch (_e) { /* ignores any error */ }
        }
        this._conn = tx || knex({
            client: 'sqlite3',
            connection: { filename: dbfile },
            useNullAsDefault: true
        });
        this._cassette = new SQLiteCasette();
        this._options = options !== null && options !== void 0 ? options : {};
    }
    async queryAll(queries) {
        let results = [];
        for (let query of queries) {
            let [a, b] = query.split(':').map((s) => s.trim());
            if (!!b && a.endsWith('.csv')) {
                const table = b || a.replace('.csv', '');
                results.push({
                    type: 'csv',
                    table,
                    records: await this.loadFromCSV(nodePath.join(process.cwd(), a), table),
                });
            }
            else if (a.endsWith('.sql')) {
                const args = !!b ? b.split(',')
                    .map((s) => s.trim())
                    .map((s) => s === NULL_MARKER ? null : s)
                    : undefined;
                (await this.queryFromFile(nodePath.join(process.cwd(), a), args))
                    .forEach((r) => results.push({
                    type: 'sql',
                    sql: r.sql,
                    records: r.records,
                }));
            }
            else {
                results.push({
                    type: 'sql',
                    sql: query,
                    records: await this.query(query),
                });
            }
        }
        return results;
    }
    async prepare(queries) {
        if (typeOf(queries) !== 'array') {
            return (await this.prepare([queries]))[0];
        }
        let result = [];
        for (let query of queries) {
            if (!query) {
                result.push(null);
                continue;
            }
            let q, r;
            if (typeOf(query) === 'string') {
                q = query;
            }
            else {
                q = query.sql || query.path;
                r = query.args || query.table;
            }
            if (q.endsWith('.sql')) {
                result.push(await this.queryFromFile(q));
            }
            else if (q.endsWith('.csv')) {
                result.push(await this.loadFromCSV(q, r));
            }
            else {
                result.push(await this.query(q, r));
            }
        }
        return result;
    }
    get knex() {
        return this._conn;
    }
    async close() {
        await this._conn.destroy();
    }
    async query(sql, opt_args) {
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
    async queryPlan(sql, opt_args) {
        const explainSql = this._cassette.explainSql(sql);
        return await this.query(explainSql, opt_args);
    }
    async queryFromFile(path, opt_args) {
        const sqls = await parseSQLFromFile(path);
        const result = [];
        let i = 0, j = 0;
        opt_args = opt_args || [];
        for (let sql of sqls) {
            if (sql.includes('?')) {
                j += (sql.match(/\?/g) || []).length;
                const args = opt_args.slice(i, j);
                i = j;
                const records = await this.query(sql, args);
                result.push({ sql, records });
            }
            else {
                const records = await this.query(sql);
                result.push({ sql, records });
            }
        }
        return result;
    }
    async queryPlanFromFile(path, opt_args) {
        const sqls = await parseSQLFromFile(path);
        return await Promise.all(zipWith(sqls, opt_args || [])
            .map((sa) => {
            const explainSql = this._cassette.explainSql(sa[0]);
            return this.query(explainSql, sa[1])
                .then((records) => ({ sql: explainSql, records: records }));
        }));
    }
    async loadFromCSV(path, table) {
        const s = await util.promisify(fs.readFile)(path, { encoding: 'utf8' });
        const objs = csv.toObject(s);
        objs.forEach((obj) => {
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
        const rs = await Promise.all(bulkGroups.map((b) => this._conn.insert(b).into(table)));
        return rs.flatMap((r) => this._cassette.rows(r));
    }
    async dryrun(fn) {
        const tx = await this._conn.transaction();
        const child = new Connection(tx);
        try {
            const result = await fn(child);
            await tx.rollback().catch((r) => r);
            return result;
        }
        catch (e) {
            await tx.rollback();
            throw e;
        }
    }
    async tableSchema(table) {
        const sql = this._cassette.tableSchemaSql();
        const result = await this.query(sql, [table]);
        result.forEach((r) => r.fks = []);
        const fks = await this._cassette.listFk(table, this);
        fks.forEach(({ column, foreign_table, foreign_column }) => {
            result
                .filter((r) => r.name === column)
                .forEach((r) => r.fks.push({
                table: foreign_table,
                column: foreign_column,
            }));
        });
        return result;
    }
    async updateAutoIncrement(table, column, count) {
        const sql = this._cassette.updateAutoIncrementSql(table, column);
        if (this._cassette instanceof MySQLCassette) {
            count = (count || 0) + 1;
        }
        return await this.query(sql, [count]);
    }
    async lastValue(table, idCol) {
        try {
            return await this.query(this._cassette.lastValueSql(table, idCol));
        }
        catch (e) {
            return [];
        }
    }
    errorOf(e) {
        return this._cassette.errorOf(e);
    }
}
exports.Connection = Connection;
Connection.util = { parseSQL };
Connection.SQL_ERROR = exports.SQL_ERROR;
exports.default = Connection;
