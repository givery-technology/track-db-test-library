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
const records = __importStar(require("./records"));
const i18n_1 = require("./i18n");
const csvjson = __importStar(require("csvjson"));
const equal = require("deep-equal");
const fs = __importStar(require("fs"));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assertions(chai, util) {
    const Assertion = chai.Assertion;
    const flag = util.flag;
    function typeOf(x) {
        return Object.prototype.toString.call(x).slice(8, -1).toLowerCase();
    }
    function indent(str, n = 2) {
        return str.split('\n').map(s => ' '.repeat(n) + s).join('\n');
    }
    /////// Record Assertions ///////
    function assertRecordEqual(val, msg) {
        doAssertRecordEqual(this, val, msg);
    }
    function assertRecordEqualToCsv(path, msg) {
        doAssertRecordEqual(this, records.normalize(csvjson.toSchemaObject(fs.readFileSync(path, "utf8"))), msg);
    }
    function prepare(self, val, msg) {
        const options = assertions.options;
        if (!!msg) {
            flag(self, 'message', msg);
        }
        let obj = flag(self, 'object');
        const withColumn = flag(self, 'withColumn');
        if (!!withColumn) {
            obj = filterColumns(obj, (column) => withColumn.has(column.toLowerCase()));
            const errormsg = (0, i18n_1.text) `Records should contain every columns` + ': ' +
                Array.from(withColumn.keys()).join(", ") + '\n' +
                (0, i18n_1.text) `Actual:` + '\n' +
                indent(records.format(obj));
            const ok = obj.every((record) => Reflect.ownKeys(record).length === withColumn.size);
            if (!ok) {
                chai.assert.fail(errormsg);
            }
            val = filterColumns(val, (column) => withColumn.has(column.toLowerCase()));
        }
        const withoutColumn = flag(self, 'withoutColumn');
        if (!!withoutColumn) {
            obj = filterColumns(obj, (column) => !withoutColumn.has(column.toLowerCase()));
            val = filterColumns(val, (column) => !withoutColumn.has(column.toLowerCase()));
        }
        return [obj, val];
    }
    function doAssertRecordEqual(self, val, msg) {
        var _a, _b;
        const options = assertions.options;
        let obj;
        [obj, val] = prepare(self, val, msg);
        const columnsDiff = diffColumns(obj, val);
        const d = records.diff(obj, val);
        const ok = d.a.size === 0 && d.b.size === 0;
        let offset = ok ? 0 :
            Math.max(Math.min(((_a = d.a.keys().next().value) !== null && _a !== void 0 ? _a : -Infinity) - 2, ((_b = d.b.keys().next().value) !== null && _b !== void 0 ? _b : -Infinity) - 2), 0);
        self.assert(ok, !!columnsDiff ? [
            !!msg ? msg : (0, i18n_1.text) `Column names should equal to expected`,
            (0, i18n_1.text) `Expected:`,
            indent(records.format(columnsDiff.b, { diff: columnsDiff.diff.b, success: true })),
            (0, i18n_1.text) `Actual:`,
            indent(records.format(columnsDiff.a, { diff: columnsDiff.diff.a })),
        ].join('\n') : [
            !!msg ? msg : (0, i18n_1.text) `Records should equal to expected`,
            (0, i18n_1.text) `Expected:`,
            indent(records.format(val, { limit: options === null || options === void 0 ? void 0 : options.limit, offset: offset, diff: d.b, success: true })),
            (0, i18n_1.text) `Actual:`,
            indent(records.format(obj, { limit: options === null || options === void 0 ? void 0 : options.limit, offset: offset, diff: d.a }))
        ].join('\n'), [
            !!msg ? msg : (0, i18n_1.text) `Records should not equal to followings`,
            (0, i18n_1.text) `Actual:`,
            indent(records.format(obj, offset))
        ].join('\n'));
    }
    function diffColumns(expected, actual) {
        if (expected.length === 0 || actual.length === 0) {
            return null;
        }
        const eCols = Object.keys(expected[0]).map((k) => ({ name: k }));
        const aCols = Object.keys(actual[0]).map((k) => ({ name: k }));
        const d = records.diff(eCols, aCols);
        const ok = d.a.size === 0 && d.b.size === 0;
        if (ok) {
            return null;
        }
        else {
            return {
                a: eCols,
                b: aCols,
                diff: d,
            };
        }
    }
    Assertion.addMethod('recordEqual', assertRecordEqual);
    Assertion.addMethod('recordEqualToCsv', assertRecordEqualToCsv);
    // recordContain -------------------
    function assertRecordContain(val, msg) {
        const options = assertions.options;
        let obj;
        if (Array.isArray(val)) {
            [obj, val] = prepare(this, val, msg);
        }
        else {
            [obj, val] = prepare(this, [val], msg);
            val = val[0];
        }
        let showRecord, ok;
        if (val instanceof Function) {
            showRecord = false;
            ok = obj.some(val);
        }
        else if (Array.isArray(val)) {
            showRecord = true;
            ok = val.every((v) => obj.some((record) => equal(record, v)));
        }
        else {
            showRecord = true;
            ok = obj.some((record) => equal(record, val));
        }
        const table = flag(this, 'table');
        this.assert(ok, showRecord ? [
            !!msg ? '' : (!!table ? (0, i18n_1.text) `Table definitions should contain the followings` + `: ${table}` : (0, i18n_1.text) `Records should contain the followings`),
            (0, i18n_1.text) `Target:`,
            indent(records.format([val].flat())),
            (0, i18n_1.text) `Actual:`,
            indent(records.format(obj)),
        ].join('\n') : [
            !!msg ? '' : (!!table ? (0, i18n_1.text) `Table definitions should contain the followings` + `: ${table}` : (0, i18n_1.text) `Records should contain the followings`),
            (0, i18n_1.text) `Actual:`,
            indent(records.format(obj)),
        ].join('\n'), showRecord ? [
            !!msg ? '' : (!!table ? (0, i18n_1.text) `Table definitions should not contain the followings` + `: ${table}` : (0, i18n_1.text) `Records should not contain the followings`),
            (0, i18n_1.text) `Target:`,
            indent(records.format([val].flat())),
            (0, i18n_1.text) `Actual:`,
            indent(records.format(obj)),
        ].join('\n') : [
            !!msg ? '' : (!!table ? (0, i18n_1.text) `Table definitions should not contain the followings` + `: ${table}` : (0, i18n_1.text) `Records should not contain the followings`),
            (0, i18n_1.text) `Actual:`,
            indent(records.format(obj)),
        ].join('\n'));
    }
    Assertion.addMethod('recordContain', assertRecordContain);
    // with(out)Column -------------------------------
    function withColumn(columns, _msg) {
        columns = toSetOfLowerCase(columns);
        flag(this, 'withColumn', columns);
    }
    function withoutColumn(columns, _msg) {
        columns = toSetOfLowerCase(columns);
        flag(this, 'withoutColumn', columns);
    }
    function toSetOfLowerCase(xs) {
        const typeOfXs = typeOf(xs);
        switch (typeOfXs) {
            case 'string':
                return new Set([xs.toLowerCase()]);
            case 'array':
                return new Set(xs.map((x) => x.toLowerCase()));
            default:
                return new Set(Array.from(xs).map((x) => x.toLowerCase()));
        }
    }
    function filterColumns(recs, filter) {
        return recs.map((record) => {
            let result = {};
            Reflect.ownKeys(record)
                .filter(filter)
                .forEach((key) => result[key] = record[key]);
            return result;
        });
    }
    Assertion.addMethod('columns', withColumn);
    Assertion.addMethod('without', withoutColumn);
    // orderBy -------------------------------
    function orderBy(columns) {
        if (typeOf(columns) !== 'array') {
            columns = Array.from(arguments);
        }
        function cmp2(a, b) {
            if (!Number.isNaN(Number(a)) && !Number.isNaN(Number(b))) {
                return Number(a) - Number(b);
            }
            else if (a === null || a === undefined) {
                if (b === null || b === undefined) {
                    return 0;
                }
                else {
                    return -1;
                }
            }
            else if (b === null || b === undefined) {
                return 1;
            }
            else {
                return a.localeCompare(b);
            }
        }
        const fns = columns.map((column) => {
            if (column.startsWith("-")) {
                column = column.substr(1).toLowerCase();
                return (a, b) => -cmp2(a[column], b[column]);
            }
            else if (column.startsWith("+")) {
                column = column.substr(1).toLowerCase();
                return (a, b) => cmp2(a[column], b[column]);
            }
            else {
                column = column.toLowerCase();
                return (a, b) => cmp2(a[column], b[column]);
            }
        });
        let recs = records.normalize(flag(this, 'object'));
        recs.sort((a, b) => {
            for (let fn of fns) {
                const v = fn(a, b);
                if (v !== 0) {
                    return v;
                }
            }
            return 0;
        });
        flag(this, 'object', recs);
    }
    Assertion.addMethod('orderBy', orderBy);
    // assertFullscan -------------------
    function assertFullscan(tables, msg) {
        if (typeOf(tables) !== 'array' && !msg) {
            msg = tables;
            tables = undefined;
        }
        if (!!msg) {
            flag(this, 'message', msg);
        }
        const recs = flag(this, 'object');
        const every = !!flag(this, 'all');
        this.assert(fullscan(recs, tables, every), !!msg ? '' : (0, i18n_1.text) `expected table full scan detected${'\n' + records.format(recs)}`, !!msg ? '' : (0, i18n_1.text) `expected table full scan not detected${'\n' + records.format(recs)}`);
    }
    function fullscan(recs, tables, every) {
        const re = new RegExp(`^SCAN(?: TABLE)? (${(tables || []).join('|') || '\\w+'})`);
        return recs[every ? 'every' : 'some']((record) => re.test(record.detail));
    }
    Assertion.addMethod('fullscan', assertFullscan);
    /////// Schema Assertions ///////
    function asTable(table) {
        flag(this, 'table', table);
    }
    Assertion.addMethod('asTable', asTable);
}
assertions.options = {};
module.exports = assertions;
