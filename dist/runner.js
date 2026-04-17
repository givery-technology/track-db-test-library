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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestRunner = void 0;
const i18n_1 = require("./i18n");
const connection_1 = require("./connection");
const yaml_1 = require("yaml");
const assertions_1 = __importDefault(require("./assertions"));
const records_1 = require("./records");
const chai = __importStar(require("chai"));
const fs = __importStar(require("fs"));
const util_1 = require("util");
const util_2 = require("./util");
const perf_hooks_1 = require("perf_hooks");
const expect = chai.expect;
chai.use(assertions_1.default);
// polyfill for Node v10
if (!Array.prototype.flat) {
    Array.prototype.flat = function (depth) {
        var flattend = [];
        (function flat(array, depth) {
            for (let el of array) {
                if (Array.isArray(el) && depth > 0) {
                    flat(el, depth - 1);
                }
                else {
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
async function precheck(conn, precheckObj) {
    if (!!precheckObj.not_empty) {
        await Promise.all([precheckObj.not_empty].flat().map(async (target) => {
            const sqls = (await (0, util_1.promisify)(fs.readFile)(target, 'utf-8'))
                .split('\n')
                .map((s) => s.replace(/--.*$/, '').trim())
                .join('\n')
                .split(';')
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
            expect(sqls, (0, i18n_1.text) `No SQL found` + `: ${target}`).not.empty;
        }));
    }
    if (!!precheckObj.one_command) {
        await Promise.all([precheckObj.one_command].flat().map(async (target) => {
            const sqls = (await (0, util_1.promisify)(fs.readFile)(target, 'utf-8'))
                .split('\n')
                .map((s) => s.replace(/--.*$/, '').trim())
                .join('\n')
                .split(';')
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
            expect(sqls, (0, i18n_1.text) `The number of SQL sentences is not 1` + `: ${target}`).to.be.lengthOf(1);
        }));
    }
    if (!!precheckObj.ecma) {
        const obj = eval(precheckObj.ecma);
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
    expect(sql, (0, i18n_1.text) `No SQL found that returns results`).to.exist;
    expect(await conn.query(`EXPLAIN QUERY PLAN ${sql}`)).not.to.have.fullscan();
}
async function checkLastQuery(conn, check, records, asTable) {
    let msg = (0, i18n_1.message)(check.message);
    if (!!check.column_list) {
        msg = msg || (0, i18n_1.text) `Output order of the columns must match the expected`;
    }
    const target_records = !!check.column_list ?
        Object.keys(records[0]).map((name, i) => ({ order: i + 1, name })) :
        records;
    let e0 = () => expect(target_records);
    let e1 = !!check.order_by ? () => e0().orderBy(check.order_by) : e0;
    let e2 = !!check.columns ? () => e1().columns(check.columns) : e1;
    let e3 = !!check.without ? () => e2().without(check.without) : e2;
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
        }
        else if (Array.isArray(check.equal_to)) {
            e().recordEqual(check.equal_to, msg);
        }
    }
    if (typeof check.len !== "undefined") {
        function lengthError(number, prePosi, postPosi, preNega, postNega) {
            return (0, i18n_1.text) `Different number of records fetched.` + " " +
                (0, i18n_1.text) `Expected:` + " " +
                (positive ? prePosi : preNega) +
                String(number) +
                (positive ? postPosi : postNega) + "\n" +
                (0, i18n_1.text) `Actual:` + "\n" +
                indent((0, records_1.format)(records));
        }
        if (isFinite(check.len)) {
            e().lengthOf(Number(check.len), msg || lengthError(check.len, '', '', (0, i18n_1.text) `__NOT(PRE)__`, (0, i18n_1.text) `__NOT(POST)__`));
        }
        if (isFinite(check.len.least)) {
            e().lengthOf.least(Number(check.len.least), msg || lengthError(check.len.least, (0, i18n_1.text) `__GE(PRE)__`, (0, i18n_1.text) `__GE(POST)__`, (0, i18n_1.text) `__LT(PRE)__`, (0, i18n_1.text) `__LT(POST)__`));
        }
        if (isFinite(check.len.most)) {
            e().lengthOf.most(Number(check.len.most), msg || lengthError(check.len.most, (0, i18n_1.text) `__LE(PRE)__`, (0, i18n_1.text) `__LE(POST)__`, (0, i18n_1.text) `__GT(PRE)__`, (0, i18n_1.text) `__GT(POST)__`));
        }
    }
    if (!!check.contain) {
        if (isString(check.contain)) {
            const fn = eval(check.contain);
            e().recordContain(fn, msg);
        }
        else {
            e().recordContain(check.contain, msg);
        }
    }
}
function isString(value) {
    return typeof value === "string" || value instanceof String;
}
function range(r) {
    if (typeof r === 'number') {
        return (x) => x === r;
    }
    const lb = !!r.gt ? (x) => x > r.gt :
        !!r.ge ? (x) => x >= r.ge :
            (_x) => true;
    const ub = !!r.lt ? (x) => x < r.lt :
        !!r.le ? (x) => x <= r.le :
            (_x) => true;
    return (x) => lb(x) && ub(x);
}
async function checkIndex(conn, check) {
    let sql = `SELECT * FROM sqlite_master WHERE type = 'index'`;
    if (!!check.index.table) {
        sql = `${sql} AND tbl_name = ${check.index.table}`;
    }
    const index_sqls = (await conn.query(sql))
        .map((record) => record.sql)
        .map((s) => REGEXP_INDEX.exec(s));
    if (!!check.index.total) {
        expect(range(check.index.total)(index_sqls.length), (0, i18n_1.text) `Total number of indexes is out of specification` + `: ${index_sqls.map((xs) => xs && xs[1]).join(', ') || (0, i18n_1.text) `No index`}`).to.be.true;
    }
    if (!!check.index.column) {
        const columns = index_sqls.flatMap((xs) => xs ? xs[3].split(',').map((x) => x.trim()) : []);
        expect(range(check.index.column)(columns.length), (0, i18n_1.text) `Total number of indexed columns is out of specification` + `: ${columns.join(', ') || (0, i18n_1.text) `No index`}`).to.be.true;
    }
}
async function checkAutoIncrement(conn, check) {
    const data = (check.data instanceof Array) ? check.data : [check.data];
    let randomId = isFinite(check.start) ? Number(check.start) : 1;
    for (let i = 0; i < data.length; i++) {
        randomId += Math.floor(Math.random() * 9000) + 1000;
        await conn.updateAutoIncrement(check.table, check.column, randomId);
        const isDataString = typeof data[i] === 'string' || data[i] instanceof String;
        let actual;
        if (isDataString) {
            await conn.queryAll([data[i]]);
            actual = (await conn.lastValue(check.table, check.column))[0];
        }
        else {
            actual = (await conn.conn.insert(data[i], ['*']).into(check.table))[0];
        }
        expect(actual[check.column], (0, i18n_1.text) `Auto increment value is not used`).to.equal(randomId + 1);
        if (i === data.length - 1) {
            let expected = isDataString ? check.expected : check.data[check.data.length - 1];
            if (typeof expected !== 'string' && !(expected instanceof String)) {
                expected = [expected].flat();
            }
            if (!!expected) {
                await checkLastQuery(conn, { equal_to: expected, without: check.column }, [actual]);
            }
        }
    }
}
async function checkLastSql(conn, check, sql) {
    if (!!check.match) {
        const matches = (check.match instanceof Array) ? check.match : [check.match];
        for (const m of matches) {
            let fn;
            let msg = (0, i18n_1.message)(check.message);
            if (m.startsWith && m.startsWith("/")) {
                const re = eval(m);
                fn = (s) => re.test(s);
                msg = msg || (0, i18n_1.text) `The last SQL should match the following regular expression` + ': ' + m;
            }
            else {
                fn = eval(m);
                msg = msg || (0, i18n_1.text) `The last SQL should be accepted by the following predicate function` + ': ' + m;
            }
            expect(sql, msg).to.satisfy(fn);
        }
    }
}
async function checkError(conn, check) {
    function messageOf(msg) {
        if (!!check.message) {
            return (0, i18n_1.message)(check.message) || '';
        }
        else if (!!check.expected) {
            return msg + (0, i18n_1.text) `.` + '\n  ' +
                (0, i18n_1.text) `SQL` + ': ' + check.sql + '\n  ' +
                (0, i18n_1.text) `Expected error` + ': ' + ((0, i18n_1.message)(`__sqle_${check.expected}__`) || '');
        }
        else {
            return msg;
        }
    }
    try {
        await conn.queryAll([check.sql]);
        expect.fail(messageOf((0, i18n_1.text) `No error detected`));
    }
    catch (e) {
        if (e.name === 'AssertionError') {
            throw e;
        }
        const err = conn.errorOf(e);
        if (check.expected) {
            expect(err[0], messageOf((0, i18n_1.text) `Unexpected error detected`)).to.eql(check.expected);
            if (check.claim) {
                let claims = Array.isArray(check.claim) ? check.claim : [check.claim];
                for (let claim of claims) {
                    let fn;
                    if (claim.startsWith('/')) {
                        fn = (s) => eval(claim).test(s);
                    }
                    else {
                        fn = (s) => s.trim() === claim.trim();
                    }
                    expect(err[1], messageOf((0, i18n_1.text) `An error with different conditions is detected`)).to.satisfy(fn);
                }
            }
        }
    }
}
async function checkPerformance(conn, check) {
    function messageOf() {
        return (!!check.message ? ((0, i18n_1.message)(check.message) || '') : (0, i18n_1.text) `Execution time is too long`) + '\n  ' + (0, i18n_1.text) `SQL` + ': ' + check.sql;
    }
    const start = perf_hooks_1.performance.now();
    await conn.queryAll([check.sql].flat());
    const end = perf_hooks_1.performance.now();
    expect(end - start, messageOf()).at.most(Number(check.threshold) || 200);
}
function applyYamlSettings(yaml) {
    var _a;
    const settings = (_a = yaml.settings) !== null && _a !== void 0 ? _a : {};
    const max_display_rows = settings.max_display_rows;
    if (max_display_rows === 'unlimited') {
        assertions_1.default.options.limit = Infinity;
    }
    else if (isFinite(max_display_rows)) {
        assertions_1.default.options.limit = Number(max_display_rows);
    }
}
async function executeTestcase(client, testcase) {
    async function doTest(tc) {
        let conn;
        try {
            conn = await connection_1.Connection.new({ client, clean: true, file: ':memory:' });
            if (!!tc.precheck) {
                await precheck(conn, tc.precheck);
            }
            let { records: recs, sql } = (await conn.queryAll((tc.exec || []).flat())).slice(-1)[0];
            let asTable;
            if (tc.table && (typeof tc.table === 'string' || tc.table instanceof String)) {
                sql = '';
                recs = await conn.tableSchema(tc.table);
                asTable = tc.table;
            }
            const checks = tc.check.length ? tc.check : [tc.check];
            for (let check of checks) {
                if (check.ecma) {
                    await checkEcma(conn, check.ecma);
                }
                else if (check.no_fullscan) {
                    await checkNoFullscan(conn, sql);
                }
                else if (check.last_sql) {
                    await checkLastSql(conn, check.last_sql, sql.trim());
                }
                else if (check.index) {
                    await checkIndex(conn, check);
                }
                else if (check.auto_increment) {
                    await checkAutoIncrement(conn, check.auto_increment);
                }
                else if (check.error) {
                    await checkError(conn, check.error);
                }
                else if (check.performance) {
                    await checkPerformance(conn, check.performance);
                }
                else {
                    await checkLastQuery(conn, check, recs, asTable);
                }
            }
        }
        finally {
            if (conn) {
                await conn.close();
            }
        }
    }
    if (!!testcase.all) {
        for (let tc of testcase.all) {
            await doTest(tc);
        }
    }
    else {
        await doTest(testcase);
    }
}
function preprocess(testcase) {
    const now = new Date().toISOString();
    function buildProps(props, defaults) {
        if (typeof props === "string") {
            props = { item: props };
        }
        if (typeof props === "undefined") {
            props = defaults;
        }
        return Object.assign({
            __random__: Math.floor(Math.random() * 9000) + 1000,
            __now__: now,
        }, defaults, props);
    }
    if (!!testcase.foreach) {
        return testcase.foreach.map((props) => (0, util_2.applyTemplate)(buildProps(props, testcase.default), testcase.template));
    }
    else {
        return [(0, util_2.applyTemplate)(buildProps(undefined), testcase)];
    }
}
class TestRunner {
    constructor(lang, yaml) {
        this.lang = lang;
        if (typeof yaml === 'string') {
            this.yaml = (0, yaml_1.parse)(fs.readFileSync(yaml, 'utf-8'));
        }
        else {
            this.yaml = yaml;
        }
    }
    runAll() {
        var _a;
        const settings = (_a = this.yaml.settings) !== null && _a !== void 0 ? _a : {};
        const max_display_rows = settings.max_display_rows;
        if (max_display_rows === 'unlimited') {
            assertions_1.default.options.limit = Infinity;
        }
        else if (isFinite(max_display_rows)) {
            assertions_1.default.options.limit = Number(max_display_rows);
        }
        for (let testcase of this.yaml.testcases) {
            preprocess(testcase).forEach((tc) => {
                this.run(tc);
            });
        }
    }
    run(testcase) {
        const client = this.yaml.client;
        describe("", function () {
            this.timeout(connection_1.Connection.timeout(client, testcase.timeout));
            it((0, i18n_1.message)(testcase.title) || '', async () => {
                await executeTestcase(client, testcase);
            });
        });
    }
    getTestcases() {
        var _a;
        const settings = (_a = this.yaml.settings) !== null && _a !== void 0 ? _a : {};
        const max_display_rows = settings.max_display_rows;
        if (max_display_rows === 'unlimited') {
            assertions_1.default.options.limit = Infinity;
        }
        else if (isFinite(max_display_rows)) {
            assertions_1.default.options.limit = Number(max_display_rows);
        }
        const result = [];
        for (const testcase of this.yaml.testcases) {
            preprocess(testcase).forEach((tc) => {
                result.push({
                    title: (0, i18n_1.message)(tc.title) || '',
                    fn: async () => { await executeTestcase(this.yaml.client, tc); },
                    timeout: connection_1.Connection.timeout(this.yaml.client, tc.timeout),
                });
            });
        }
        return result;
    }
}
exports.TestRunner = TestRunner;
function indent(str, n = 2) {
    return str.split('\n').map(s => ' '.repeat(n) + s).join('\n');
}
exports.default = TestRunner;
