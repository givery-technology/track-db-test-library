const csv = require('csvjson');
const cp = require('child_process');
const fs = require('fs');
const knex = require('knex');
const path = require('path');
const util = require('util');
const _ = require('./i18n').text;

const NULL_MARKER = '__null__';

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

async function parseSQL(path) {
	const sqls = await util.promisify(fs.readFile)(path, { encoding: 'utf8' });
	return sqls.split('\n')
		.map(sql => sql.split('--')[0])
		.join('\n')
		.split(/;\n?/)
		.map(sql => sql.trim())
		.filter(sql => sql.length !== 0);
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
}

class PostgreSQLCasette {
	async newConnection(options) {
		const exec = util.promisify(cp.exec);
		const p = cp.spawn('docker-entrypoint.sh', ['postgres'], {
			detached: true,
		});
		if (options.verbose) {
			p.stdout.on('data', data => console.log(data.toString()));
			p.stderr.on('data', data => console.error(data.toString()));
		}
		async function sleep(ms) {
			return new Promise((res, rej) => {
				setTimeout(() => res(), ms);
			});
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
				casette = new PostgreSQLCasette();
				break;
			default:
				casette = new SQLiteCasette();
				break;
		}

		let conn = await casette.newConnection(options);
		return new Connection(conn, casette);
	}

	constructor(conn, casette) {
		// Legacy mode
		if (!casette || !casette.newConnection) {
			this._initLegacy(conn, casette);
			return;
		}

		// New mode
		this._conn = conn;
		this._cassette = casette;
	}

	get casette() {
		return this._cassette;
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
			} catch (_e) { /* ignores any error */ }
		}
		this._conn = tx || knex({
			client: 'sqlite3',
			connection: { filename: dbfile },
			useNullAsDefault: true
		});
		this._cassette = new SQLiteCasette();
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
				(await this.queryFromFile(path.join(process.cwd(), query)))
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
	 * @param {string}    sql       A single SQL to query.
	 * @param {string[]=} opt_args  Optional arguments for the SQL.
	 * @returns {Promise<Array<object>?>}
	 */
	async query(sql, opt_args) {
		if (sql.trim().length === 0) {
			throw 'Empty query';
		}
		const records = await this._conn.raw(sql, opt_args);
		return records.rows ? records.rows /* postgres */ : records /* sqlite */;
	}

	/**
	 * Query a plan for single SQL.
	 * @param {string}    sql       A single SQL to query.
	 * @param {string[]=} opt_args  Optional arguments for the SQL.
	 * @returns {Promise<Array<object>?>}
	 */
	async queryPlan(sql, opt_args) {
		const explainSql = this._cassette.explainSql(sql);
		return await this.query(explainSql, opt_args);
	}

	/**
	 * Query sqls loaded from a file.
	 * @param {string}    path      File Path
	 * @returns {Promise<Array<{sql: string, records: object}>?>}
	 */
	async queryFromFile(path) {
		const sqls = await parseSQL(path);
		const result = [];
		for (let sql of sqls) {
			const records = await this.query(sql);
			result.push({sql, records});
		}
		return result;
	}

	/**
	 * Query plans for sqls loaded from a file.
	 * @param {string}      path      File Path
	 * @param {string[][]}  opt_args  Optional arguments
	 * @returns {Promise<Array<{sql: string, records: object}>?>}
	 */
	async queryPlanFromFile(path, opt_args) {
		const sqls = await parseSQL(path);
		return await Promise.all(
			zipWith(sqls, opt_args)
				.map(sa => {
					const explainSql = this._cassette.explainSql(sa[0]);
					return this.query(explainSql, sa[1])
							.then(records => ({sql: explainSql, records: records}))
					}
				)
		);
	}

	/**
	 * Load records from CSV and insert them into given table.
	 * @param {string}    path      CSV file path
	 * @param {string}    table     Table name to be inserted
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
		res.push(keys.map((key, i) => `  ..${' '.repeat(sizes[i] - 4)}`));
	}
	res.push(keys.map((key, i) => '-'.repeat(sizes[i])));
	return res.map(x => x.join('  ')).join('\n') + '\n';
}
format.records = formatRecords;

module.exports = Connection;
