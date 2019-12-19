#!/usr/bin/env node

const _ = require('./i18n').text;
const Connection = require('./connection');
const YAML = require('yaml');
const assertions = require('./assertions');
const chai = require('chai');
const expect = chai.expect;
const fs = require('fs');
const { promisify } = require('util');

chai.use(assertions);

// polyfill for Node v10
if (!Array.prototype.flat) {
    Array.prototype.flat = function(depth) {
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
    Array.prototype.flatMap = function() {
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
					.filter(s => s.length > 0);
				expect(sqls, _`No SQL found` + `: ${target}`).not.empty;
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

async function checkLastQuery(conn, check, records) {
	let e = expect(records);
	if (!!check.order_by) {
		e = e.orderBy(check.order_by)
	}
	if (!!check.equal_to) {
		if (check.equal_to.endsWith && check.equal_to.endsWith(".csv")) {
			e.recordEqualToCsv(check.equal_to);
		}
		e = null;
	}
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
        describe("", () => {
            const conn = new Connection({clean: true});
            for (let testcase of this.yaml.testcases) {
                const title = testcase.title[this.lang || 'ja'] || testcase.title;
                it(title, async () => {
                	if (!!testcase.precheck) {
                		await precheck(conn, testcase.precheck);
					}

					let { records, sql } = (await conn.queryAll((testcase.exec || []).flat())).slice(-1)[0];

                    const checks = testcase.check.length ? testcase.check : [testcase.check];
                    for (let check of checks) {
                        if (check.ecma) {
                            await checkEcma(conn, check.ecma);
                        } else if (check.no_fullscan) {
							await checkNoFullscan(conn, sql);
						} else if (check.index) {
                        	await checkIndex(conn, check);
                        } else {
                            await checkLastQuery(conn, check, records);
                        }
                    }
                });
            }
        });
    }
}

module.exports = TestRunner;
