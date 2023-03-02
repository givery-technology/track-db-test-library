#!/usr/bin/env node

const _ = require('./i18n').text;
const __ = require('./i18n').message;
const Connection = require('./connection');
const YAML = require('yaml');
const assertions = require('./assertions');
const format = require('./records').format;
const chai = require('chai');
const expect = chai.expect;
const fs = require('fs');
const { promisify } = require('util');
const i18n = require('./i18n');
const { applyTemplate } = require('./util');
const performance = require('perf_hooks').performance;

chai.use(assertions);

// polyfill for Node v10
if (!Array.prototype.flat) {
	Array.prototype.flat = function (depth) {
		var flattend = [];
		(function flat(array, depth) {
			for (let el of array) {
				if (Array.isArray(el) && depth > 0) {
					flat(el, depth - 1);
				} else {
					flattend.push(el);
				}
			}
		})(this, Math.floor(depth) || 1);
		return flattend;
	};
}
if (!Array.prototype.flatMap) {
	Array.prototype.flatMap = function () {
		return Array.prototype.map.apply(this, arguments).flat(1);
	};
}

const REGEXP_INDEX = /CREATE\s+INDEX\s+([A-Za-z0-9_]+)\s+ON\s+([A-Za-z0-9_]+)\s*\(([A-Za-z0-9_,\s]+)\)/i;

async function precheck(conn, precheck) {
	if (!!precheck.not_empty) {
		await Promise.all(
			[precheck.not_empty].flat().map(async target => {
				const sqls = (await promisify(fs.readFile)(target, 'utf-8'))
					.split('\n')
					.map(s => s.replace(/--.*$/, '').trim())
					.join('\n')
					.split(';')
					.map(s => s.trim())
					.filter(s => s.length > 0);
				expect(sqls, _`No SQL found` + `: ${target}`).not.empty;
			})
		);
	}
	if (!!precheck.one_command) {
		await Promise.all(
			[precheck.one_command].flat().map(async target => {
				const sqls = (await promisify(fs.readFile)(target, 'utf-8'))
					.split('\n')
					.map(s => s.replace(/--.*$/, '').trim())
					.join('\n')
					.split(';')
					.map(s => s.trim())
					.filter(s => s.length > 0);
				expect(sqls, _`The number of SQL sentences is not 1` + `: ${target}`).to.be.lengthOf(1);
			})
		);
	}
	if (!!precheck.ecma) {
		const obj = eval(precheck.ecma);
		if (typeof obj === 'function') {
			await obj(conn);
		}
	}
}

async function checkEcma(conn, script) {
	const obj = eval(script);
	if (typeof obj === 'function') {
		await obj(conn);
	}
}

async function checkNoFullscan(conn, sql) {
	expect(sql, _`No SQL found that returns results`).to.exist;
	expect(await conn.query(`EXPLAIN QUERY PLAN ${sql}`)).not.to.have.fullscan();
}

async function checkLastQuery(conn, check, records, asTable) {
	let msg = __(check.message);
	if (!!check.column_list) {
		msg = msg || _`Output order of the columns must match the expected`;
	}
	const target_records = !!check.column_list ?
		Object.keys(records[0]).map((name, i) => ({ order: i + 1, name })) :
		records;
	let e0 = () => expect(target_records);
	let e1 = !!check.order_by ? () => e0().orderBy(check.order_by) : e0;
	let e2 = !!check.columns  ? () => e1().columns(check.columns)  : e1;
	let e3 = !!check.without  ? () => e2().without(check.without)  : e2;

	let e = !!asTable ? () => e3().asTable(asTable) : e3;

	await doCheckLastQuery(conn, check, e, true, target_records, msg);
}

async function doCheckLastQuery(conn, check, e, positive, records, msg) {
	if (!!check.not) {
		await doCheckLastQuery(conn, check.not, () => e().not, !positive, records, msg);
	}
	if (!!check.equal_to) {
		if (check.equal_to.endsWith && check.equal_to.endsWith(".csv")) {
			e().recordEqualToCsv(check.equal_to, msg);
		} else if (Array.isArray(check.equal_to)) {
			e().recordEqual(check.equal_to, msg);
		}
	}
	if (typeof check.len !== "undefined") {
		function lengthError(number, prePosi, postPosi, preNega, postNega) {
			return _`Different number of records fetched.` + " " +
			  _`Expected:` + " " +
			  (positive ? prePosi : preNega) +
			  String(number) +
			  (positive ? postPosi : postNega) + "\n" +
			  _`Actual:` + "\n" +
			  indent(format(records));
		}
		if (isFinite(check.len)) {
			e().lengthOf(Number(check.len), msg || lengthError(check.len, '', '', _`__NOT(PRE)__`, _`__NOT(POST)__`));
		}
		if (isFinite(check.len.least)) {
			e().lengthOf.least(Number(check.len.least), msg || lengthError(check.len.least, _`__GE(PRE)__`, _`__GE(POST)__`, _`__LT(PRE)__`, _`__LT(POST)__`));
		}
		if (isFinite(check.len.most)) {
			e().lengthOf.most(Number(check.len.most), msg || lengthError(check.len.most, _`__LE(PRE)__`, _`__LE(POST)__`, _`__GT(PRE)__`, _`__GT(POST)__`));
		}
	}
	if (!!check.contain) {
		if (isString(check.contain)) {
			const fn = eval(check.contain);
			e().recordContain(fn, msg);
		} else {
			e().recordContain(check.contain, msg);
		}
	}
}

function isString(value) {
	return typeof value === "string" || value instanceof String;
}

function range(r) {
	if (typeof r === 'number') {
		return x => x === r;
	}
	const lb =
		!!r.gt ? x => x > r.gt :
			!!r.ge ? x => x >= r.ge :
				x => true;
	const ub =
		!!r.lt ? x => x < r.lt :
			!!r.le ? x => x <= r.le :
				x => true;
	return x => lb(x) && ub(x);
}

async function checkIndex(conn, check) {
	let sql = `SELECT * FROM sqlite_master WHERE type = 'index'`;
	if (!!check.index.table) {
		sql = `${sql} AND tbl_name = ${check.index.table}`;
	}
	const index_sqls = (await conn.query(sql))
		.map(record => record.sql)
		.map(sql => REGEXP_INDEX.exec(sql));
	if (!!check.index.total) {
		expect(range(check.index.total)(index_sqls.length), _`Total number of indexes is out of specification` + `: ${index_sqls.map(xs => xs[1]).join(', ') || _`No index`}`).to.be.true;
	}
	if (!!check.index.column) {
		const columns = index_sqls.flatMap(xs => xs[3].split(',').map(x => x.trim()));
		expect(range(check.index.column)(columns.length), _`Total number of indexed columns is out of specification` + `: ${columns.join(', ') || _`No index`}`).to.be.true;
	}
}

async function checkAutoIncrement(conn, check) {
	const data = (check.data instanceof Array) ? check.data : [check.data];
	let randomId = isFinite(check.start) ? Number(check.start) : 1;
	for (let i = 0; i < data.length; i++) {
		randomId += Math.floor(Math.random() * 9000) + 1000;
		await conn.updateAutoIncrement(check.table, check.column, randomId);
		let actual;
		if (typeof data[i] === 'string' || data[i] instanceof String) {
			await conn.queryAll([data[i]]);
			actual = (await conn.lastValue(check.table, check.column))[0][check.column];
		} else {
			// Data object 指定の場合は INSERT + RETURNING で一発
			actual = (await conn.conn().insert(
				data[i],
				[check.column],
			).into(check.table))[0][check.column];
		}
		expect(actual, _`Auto increment value is not used`).to.equal(randomId + 1);
	}
}

async function checkLastSql(conn, check, sql) {
	if (!!check.match) {
		const matches = (check.match instanceof Array) ? check.match : [check.match];
		for (const m of matches) {
			let fn;
			let msg = __(check.message);
			if (m.startsWith && m.startsWith("/")) {
				const re = eval(m);
				fn = s => re.test(s);
				msg = msg || _`The last SQL should match the following regular expression` + ': ' + m;
			} else {
				fn = eval(m);
				msg = msg || _`The last SQL should be accepted by the following predicate function` + ': ' + m;
			}
			expect(sql, msg).to.satisfy(fn);
		}
	}
}

async function checkError(conn, check) {
	function message(msg) {
		if (!!check.message) {
			return __(check.message);
		} else if (!!check.expected) {
			return msg + _`.` + '\n  ' +
			  _`SQL` + ': ' + check.sql + '\n  ' +
			  _`Expected error` + ': ' + __(`__sqle_${check.expected}__`);
		} else {
			return msg;
		}
	}

	try {
		await conn.query(check.sql);
		expect.fail(message(_`No error detected`));
	} catch (e) {
		if (e.name === 'AssertionError') {
			throw e;
		}
		const err = conn.errorOf(e);
		if (check.expected) {
			expect(err[0], message(_`Unexpected error detected`)).to.eql(check.expected);
			if (check.claim) {
				let claims = Array.isArray(check.claim) ? check.claim : [ check.claim ];
				for (let claim of claims) {
					let fn;
					if (claim.startsWith('/')) {
						fn = s => eval(claim).test(s);
					} else {
						fn = s => s.trim() === claim.trim();
					}
					expect(err[1], message(_`An error with different conditions is detected`)).to.satisfy(fn);
				}
			}
		}
	}
}

async function checkPerformance(conn, check) {
	function message() {
		return (
			!!check.message ? __(check.message) : _`Execution time is too long`
		) + '\n  ' + _`SQL` + ': ' + check.sql;
	}

	const start = performance.now();
	await conn.queryAll([check.sql].flat());
	const end = performance.now();
	expect(end - start, message()).at.most(Number(check.threshold) || 200);

}

function preprocess(testcase) {
	if (!!testcase.foreach) {
		return testcase.foreach.map(props => applyTemplate(props, testcase.default, testcase.template));
	} else {
		return [testcase];
	}
}

class TestRunner {
	constructor(lang, yaml) {
		this.lang = lang;
		if (typeof yaml === 'string') {
			this.yaml = YAML.parse(fs.readFileSync(yaml, 'utf-8'));
		} else {
			this.yaml = yaml;
		}
	}

	runAll() {
		const settings = this.yaml.settings ?? {};

		const max_display_rows = settings.max_display_rows;
		if (max_display_rows === 'unlimited') {
			assertions.options.limit = Infinity;
		} else if (isFinite(max_display_rows)) {
			assertions.options.limit = Number(max_display_rows);
		}

		for (let testcase of this.yaml.testcases) {
			preprocess(testcase).forEach(tc => {
				this.run(tc);
			});
		}
	}

	run(testcase) {
		const self = this;
		describe("", function () {
			this.timeout(Connection.timeout(self.yaml.client, testcase.timeout));
			const title = testcase.title[self.lang || 'ja'] || testcase.title;
			it(title, async () => {
				let conn;
				try {
					conn = await Connection.new({ client: self.yaml.client, clean: true, file: ':memory:' });
					if (!!testcase.precheck) {
						await precheck(conn, testcase.precheck);
					}

					let { records, sql } = (await conn.queryAll((testcase.exec || []).flat())).slice(-1)[0];
					let asTable;

					if (testcase.table && (typeof testcase.table === 'string' || testcase.table instanceof String)) {
						sql = '';
						records = await conn.tableSchema(testcase.table);
						asTable = testcase.table;
					}

					const checks = testcase.check.length ? testcase.check : [testcase.check];
					for (let check of checks) {
						if (check.ecma) {
							await checkEcma(conn, check.ecma);
						} else if (check.no_fullscan) {
							await checkNoFullscan(conn, sql);
						} else if (check.last_sql) {
							await checkLastSql(conn, check.last_sql, sql.trim());
						} else if (check.index) {
							await checkIndex(conn, check);
						} else if (check.auto_increment) {
							await checkAutoIncrement(conn, check.auto_increment);
						} else if (check.error) {
							await checkError(conn, check.error);
						} else if (check.performance) {
							await checkPerformance(conn, check.performance);
						} else {
							await checkLastQuery(conn, check, records, asTable);
						}
					}
				} finally {
					conn && conn.close();
				}
			});
		});
	}
}

function indent(str, n = 2) {
	return str.split('\n').map(s => ' '.repeat(n) + s).join('\n');
}

module.exports = TestRunner;
