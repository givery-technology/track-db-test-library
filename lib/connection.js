const csv = require('csvjson');
const fs = require('fs');
const knex = require('knex');
const path = require('path');
const util = require('util');
const _ = require('./i18n').text;

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

/**
 * Handles SQLite connection
 */
class Connection {
	constructor(tx) {
		this._conn = tx || knex({
			client: 'sqlite3',
			connection: { filename: 'db.sqlite' },
			useNullAsDefault: true
		})
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
		return await this._conn.raw(sql, opt_args);
	}

	/**
	 * Query a plan for single SQL.
	 * @param {string}    sql       A single SQL to query.
	 * @param {string[]=} opt_args  Optional arguments for the SQL.
	 * @returns {Promise<Array<object>?>}
	 */
	async queryPlan(sql, opt_args) {
		return await this.query('EXPLAIN QUERY PLAN ' + sql, opt_args);
	}

	/**
	 * Query sqls loaded from a file.
	 * @param {string}    path      File Path
	 * @returns {Promise<Array<{sql: string, records: object}>?>}
	 */
	async queryFromFile(path) {
		const sqls = await parseSQL(path);
		return await Promise.all(
			sqls.map(sql => this.query(sql)
				.then(records => ({sql: sql, records: records}))
			)
		);
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
				.map(sa => this.query('EXPLAIN QUERY PLAN ' + sa[0], sa[1])
					.then(records => ({sql: 'EXPLAIN QUERY PLAN ' + sa[0], records: records}))
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
