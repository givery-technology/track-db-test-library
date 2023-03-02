const csv = require('csvjson');
const cp = require('child_process');
const fs = require('fs');
const knex = require('knex');
const path = require('path');
const util = require('util');
const _ = require('./i18n').text;

const NULL_MARKER = '__null__';
const SQL_ERROR = {
	CHECK: 'check',
	NOT_NULL: 'not_null',
	UNIQUE: 'unique',
	UNKNOWN:  'unknown',
}

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
	return flatMap(xs, x => x);
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
		.replace(/\/\*.*?\*\//gms, '') // ラインコメントよりブロックコメントの方が優先
		.replace(/--[^\n]*$/gm, '') // string 内で "--" 使われるのは諦める; 正規表現の範囲外
		.split(/;\n?/)
		.map(sql => sql.trim())
		.filter(sql => sql.length !== 0);
}

async function parseSQLFromFile(path) {
	const sqls = await util.promisify(fs.readFile)(path, { encoding: 'utf8' });
	return parseSQL(sqls);
}

function typeOf(x) {
	return Object.prototype.toString.call(x).slice(8, -1).toLowerCase();
}

class SQLiteCasette {
	async newConnection(options) {
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
	updateAutoIncrementSql(table, column) {
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
			const columns = m[1].split(',').map(c => c.trim());
			const foreign_columns = m[3].split(',').map(c => c.trim());
			columns.forEach(column => {
				foreign_columns.forEach(foreign_column => {
					result.push({ column, foreign_table: m[2], foreign_column});
				})
			})
		}
		return result;
	}
	errorOf(e) {
		if (/SQLITE_CONSTRAINT: NOT NULL/.test(e.stack)) {
			return [SQL_ERROR.NOT_NULL];
		} else if (/SQLITE_CONSTRAINT: UNIQUE/.test(e.stack)) {
			return [SQL_ERROR.UNIQUE];
		} else if (/SQLITE_CONSTRAINT: CHECK/.test(e.stack)) {
			const xs = e.stack.split(':').map(s => s.trim());
			const claim = xs[xs.length - 1];
			return [SQL_ERROR.CHECK, claim];
		} else {
			return [SQL_ERROR.UNKNOWN];
		}
	}
}

class PostgreSQLCasette {
	async newConnection(options) {
		const exec = util.promisify(cp.exec);
		async function sleep(ms) {
			return new Promise((res, rej) => {
				setTimeout(() => res(), ms);
			});
		}

		async function connect() {
			return new Promise((_res, _rej) => {
				let done = false;
				const res = (...args) => {
					if (!done) {
						done = true;
						_res(...args);
					}
				}
				const rej = (...args) => {
					if (!done) {
						done = true;
						_rej(...args);
					}
				}
				sleep(10000).then(() => rej(new Error('Timeout database connection')));
				const p = cp.spawn('docker-entrypoint.sh', ['postgres'], {
					detached: true,
				});
				p.stdout.on('data', data => {
					const message = data.toString();
					if (options.verbose) {
						console.log(message);
					}
					if (message.includes('database system is ready to accept connections')) {
						res();
					}
				});
				p.stderr.on('data', data => {
					const message = data.toString();
					if (options.verbose) {
						console.error(message);
					}
					if (message.includes('database system is ready to accept connections')) {
						res();
					}
				});
			});
		}

		for (let retries = 5; retries > 0; retries--) {
			if (fs.existsSync('/var/lib/postgresql/data/postmaster.pid')) {
				fs.unlinkSync('/var/lib/postgresql/data/postmaster.pid');
			}
			try {
				await connect();
				break;
			} catch (e) {
				if (options.verbose) {
					console.error(e);
				}
			}
			await sleep(1000);
		}

		for (let retries = 20; retries > 0; retries--) {
			try {
				const conn = knex({
					client: 'pg',
					connection: {
						host: '127.0.0.1',
						user: 'postgres',
						database: 'postgres',
						password: 'password',
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
	errorOf(e) {
		return [SQL_ERROR.UNKNOWN];
	}
}

/**
 * Handles SQLite connection
 */
class Connection {
	static timeout(client, extra) {
		switch (client) {
			case "pg":
			case "postgres":
			case "postgresql":
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
				casette = new PostgreSQLCasette(options);
				break;
			default:
				casette = new SQLiteCasette(options);
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
		this._options = options ?? {};
	}

	get casette() {
		return this._cassette;
	}

	get conn() {
		return this._conn;
	}

	destroy() {
		this._conn.context.destroy()
	}

	_initLegacy(tx, options) {
		if (!!tx && !tx.transaction) {
			options = tx;
			tx = null;
		}
		const dbfile = (options || {}).file || ':memory:';
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

	async queryAll(queries) {
		let results = [];
		for (let query of queries) {
			let [a, b] = query.split(':').map(s => s.trim());
			if (!!b && a.endsWith('.csv')) {
				const table = b || a.replace('.csv', '');
				results.push({
					type: 'csv',
					table,
					records: await this.loadFromCSV(path.join(process.cwd(), a), table),
				});
			} else if (query.endsWith('.sql')) {
				const args = !!b ? b.split(',')
					.map(s => s.trim())
					.map(s => s === NULL_MARKER ? null : s)
					: undefined;
				(await this.queryFromFile(path.join(process.cwd(), a), args))
					.forEach(r => results.push({
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

	async prepare(queries) {
		if (typeOf(queries) !== 'array') {
			return this.prepare([queries])[0];
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
			} else {
				q = query.sql || query.path;
				r = query.args || query.table;
			}
			if (q.endsWith('.sql')) {
				result.push(await this.queryFromFile(q));
			} else if (q.endsWith('.csv')) {
				result.push(await this.loadFromCSV(q, r));
			} else {
				result.push(await this.query(q, r))
			}
		}
		return result;
	}

	get knex() {
		return this._conn;
	}

	/**
	 * Explicitly close the connection
	 */
	close() {
		return this._conn.destroy();
	}

	/**
	 * Query a single SQL.
	 * @param {string}	  sql       A single SQL to query.
	 * @param {string[]=} opt_args	Optional arguments for the SQL.
	 * @returns {Promise<Array<object>?>}
	 */
	async query(sql, opt_args) {

		function rows(records) {
			return !!records.rows ? records.rows /* postgres */ : records /* sqlite */
		}

		if (sql.trim().length === 0) {
			throw 'Empty query';
		}

		const isSelectStatement = /^\s*SELECT /i.test(sql);
		if (isSelectStatement) {
			const count = rows(await this._conn.raw(`SELECT count(1) AS count FROM (${sql.replace(/;\s*$/, "")}) AS x`, opt_args)).length;
			if (count > (this._options.maxRows || 10000)) {
				throw 'Too many records';
			}
		}

		return rows(await this._conn.raw(sql, opt_args));
	}

	/**
	 * Query a plan for single SQL.
	 * @param {string}	  sql       A single SQL to query.
	 * @param {string[]=} opt_args	Optional arguments for the SQL.
	 * @returns {Promise<Array<object>?>}
	 */
	async queryPlan(sql, opt_args) {
		const explainSql = this._cassette.explainSql(sql);
		return await this.query(explainSql, opt_args);
	}

	/**
	 * Query sqls loaded from a file.
	 * @param {string}    path      File Path
	 * @param {string[]=} opt_args  Optional Arguments for the Queries
	 * @returns {Promise<Array<{sql: string, records: object}>?>}
	 */
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

	/**
	 * Query plans for sqls loaded from a file.
	 * @param {string}	    path      File Path
	 * @param {string[][]}	opt_args  Optional arguments
	 * @returns {Promise<Array<{sql: string, records: object}>?>}
	 */
	async queryPlanFromFile(path, opt_args) {
		const sqls = await parseSQLFromFile(path);
		return await Promise.all(
			zipWith(sqls, opt_args)
				.map(sa => {
					const explainSql = this._cassette.explainSql(sa[0]);
					return this.query(explainSql, sa[1])
						.then(records => ({ sql: explainSql, records: records }))
				})
		);
	}

	/**
	 * Load records from CSV and insert them into given table.
	 * @param {string}	  path      CSV file path
	 * @param {string}	  table     Table name to be inserted
	 * @return {Promise<Array<object>?[]>}
	 */
	async loadFromCSV(path, table) {
		const s = await util.promisify(fs.readFile)(path, { encoding: 'utf8' });
		const objs = csv.toObject(s);
		objs.forEach(obj => {
			for (let i in obj) {
				if (!obj.hasOwnProperty(i)) {
					continue;
				}
				if (obj[i] === NULL_MARKER) {
					obj[i] = null;
				}
			}
		});
		const bulks = bulk(objs, 50);
		const rs = await Promise.all(
			bulks.map(bulk => this._conn.insert(bulk).into(table))
		);
		return flatten(rs);
	}

	/**
	 * Dry runs a transaction
	 * @param {Supplier<T>>} fn
	 * @return {Promise<T>}
	 * @template T
	 * @deprecated only for sqlite
	 */
	async dryrun(fn) {
		const tx = await this._conn.transaction();
		const child = new Connection(tx);
		try {
			const result = await fn(child);
			await tx.rollback().catch(r => r);
			return result;
		} catch (e) {
			await tx.rollback();
			throw e;
		}
	}

	/**
	 * Returns table schema
	 * @param {string} table
	 * @return {Array<{order: number, name: string, raw_type: string, fks: Array<{ table, name }>}>}
	 */
	async tableSchema(table) {
		const sql = this._cassette.tableSchemaSql();
		const result = await this.query(sql, [table]);
		result.forEach(r => r.fks = []);
		const fks = await this._cassette.listFk(table, this);
		fks.forEach(({ column, foreign_table, foreign_column }) => {
			result
				.filter(r => r.name === column)
				.forEach(r => r.fks.push({
					table: foreign_table,
					column: foreign_column,
				}));
		});
		return result;
	}

	async updateAutoIncrement(table, column, count) {
		const sql = this._cassette.updateAutoIncrementSql(table, column);
		return await this.query(sql, [count]);
	}

	async lastValue(table, idCol) {
		try {
			return await this.query(this._cassette.lastValueSql(table, idCol));
		} catch (e) {
			return [];
		}
	}

	errorOf(e) {
		return this._cassette.errorOf(e);
	}
}

function format(message, sql, results) {
	return `${message}\n${indent(sql)}\n\n${indent('') + results.length} ` +
		_`row(s) selected` + `\n${indent(formatRecords(results))}`;
}

function indent(str, n = 2) {
	return str.split('\n').map(s => ' '.repeat(n) + s).join('\n');
}

function formatRecords(results, limit = 20) {
	const len = results.length;
	if (!len) {
		return '';
	}
	const keys = Reflect.ownKeys(results[0]);
	const limited = results.length > limit;
	results = results.slice(0, limit);

	const minSize = 10;
	const sizes = keys.map(key => Math.max(minSize, key.length));
	results.forEach(result => {
		keys.forEach((key, i) => {
			sizes[i] = Math.max(sizes[i], String(result[key]).length);
		});
	});

	let res = [];
	res.push(keys.map((key, i) => '-'.repeat(sizes[i])));
	res.push(keys.map((key, i) => key.padEnd(sizes[i])));
	res.push(keys.map((key, i) => '-'.repeat(sizes[i])));
	results.forEach(function (result) {
		res.push(keys.map((key, i) => String(result[key]).padEnd(sizes[i])));
	});

	if (limited) {
		res.push(keys.map((key, i) => `	..${' '.repeat(sizes[i] - 4)}`));
	}
	res.push(keys.map((key, i) => '-'.repeat(sizes[i])));
	return res.map(x => x.join('	')).join('\n') + '\n';
}
format.records = formatRecords;

module.exports = Connection;
module.exports.util = {
	parseSQL,
}
module.exports.SQL_ERROR = SQL_ERROR;
