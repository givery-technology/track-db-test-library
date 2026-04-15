import * as records from './records';
import { text as _ } from './i18n';
import * as csvjson from 'csvjson';
import equal = require('deep-equal');
import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assertions(chai: any, util: any): void {
  const Assertion = chai.Assertion;
  const flag = util.flag;

  function typeOf(x: any): string {
    return Object.prototype.toString.call(x).slice(8, -1).toLowerCase();
  }

  function indent(str: string, n: number = 2): string {
    return str.split('\n').map(s => ' '.repeat(n) + s).join('\n');
  }

  /////// Record Assertions ///////
  function assertRecordEqual(this: any, val: any, msg?: string): void {
    doAssertRecordEqual(this, val, msg);
  }

  function assertRecordEqualToCsv(this: any, path: string, msg?: string): void {
    doAssertRecordEqual(this, records.normalize(csvjson.toSchemaObject(fs.readFileSync(path, "utf8"))), msg);
  }

  function prepare(self: any, val: any, msg?: string): [any, any] {
    const options = (assertions as any).options;
    if (!!msg) {
      flag(self, 'message', msg);
    }
    let obj = flag(self, 'object');
    const withColumn = flag(self, 'withColumn');
    if (!!withColumn) {
      obj = filterColumns(obj, (column: string) => withColumn.has(column.toLowerCase()));
      const errormsg = _`Records should contain every columns` + ': ' +
        Array.from((withColumn as Set<string>).keys()).join(", ") + '\n' +
        _`Actual:` + '\n' +
        indent(records.format(obj));
      const ok = obj.every((record: any) => Reflect.ownKeys(record).length === withColumn.size);
      if (!ok) {
        chai.assert.fail(errormsg);
      }
      val = filterColumns(val, (column: string) => withColumn.has(column.toLowerCase()));
    }
    const withoutColumn = flag(self, 'withoutColumn');
    if (!!withoutColumn) {
      obj = filterColumns(obj, (column: string) => !(withoutColumn as Set<string>).has(column.toLowerCase()));
      val = filterColumns(val, (column: string) => !(withoutColumn as Set<string>).has(column.toLowerCase()));
    }
    return [obj, val];
  }

  function doAssertRecordEqual(self: any, val: any, msg?: string): void {
    const options = (assertions as any).options;
    let obj: any;
    [obj, val] = prepare(self, val, msg);

    const columnsDiff = diffColumns(obj, val);
    const d = records.diff(obj, val);
    const ok = d.a.size === 0 && d.b.size === 0;
    let offset = ok ? 0 :
      Math.max(Math.min((d.a.keys().next().value ?? -Infinity) - 2, (d.b.keys().next().value ?? -Infinity) - 2), 0);

    self.assert(
      ok,
      !!columnsDiff ? [
        !!msg ? msg : _`Column names should equal to expected`,
        _`Expected:`,
        indent(records.format(columnsDiff.b, { diff: columnsDiff.diff.b, success: true })),
        _`Actual:`,
        indent(records.format(columnsDiff.a, { diff: columnsDiff.diff.a })),
      ].join('\n') : [
        !!msg ? msg : _`Records should equal to expected`,
        _`Expected:`,
        indent(records.format(val, { limit: options?.limit, offset: offset, diff: d.b, success: true })),
        _`Actual:`,
        indent(records.format(obj, { limit: options?.limit, offset: offset, diff: d.a }))
      ].join('\n'),
      [
        !!msg ? msg : _`Records should not equal to followings`,
        _`Actual:`,
        indent(records.format(obj, offset as any))
      ].join('\n')
    );
  }

  function diffColumns(expected: any[], actual: any[]): any {
    if (expected.length === 0 || actual.length === 0) {
      return null;
    }
    const eCols = Object.keys(expected[0]).map((k: string) => ({ name: k }));
    const aCols = Object.keys(actual[0]).map((k: string) => ({ name: k }));
    const d = records.diff(eCols, aCols);
    const ok = d.a.size === 0 && d.b.size === 0;
    if (ok) {
      return null;
    } else {
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
  function assertRecordContain(this: any, val: any, msg?: string): void {
    const options = (assertions as any).options;
    let obj: any;
    if (Array.isArray(val)) {
      [obj, val] = prepare(this, val, msg);
    } else {
      [obj, val] = prepare(this, [val], msg);
      val = val[0];
    }
    let showRecord: boolean, ok: boolean;
    if (val instanceof Function) {
      showRecord = false;
      ok = obj.some(val);
    } else if (Array.isArray(val)) {
      showRecord = true;
      ok = val.every((v: any) => obj.some((record: any) => equal(record, v)));
    } else {
      showRecord = true;
      ok = obj.some((record: any) => equal(record, val));
    }

    const table = flag(this, 'table');
    this.assert(
      ok,
      showRecord ? [
        !!msg ? '' : (!!table ? _`Table definitions should contain the followings` + `: ${table}` : _`Records should contain the followings`),
        _`Target:`,
        indent(records.format([val].flat())),
        _`Actual:`,
        indent(records.format(obj)),
      ].join('\n') : [
        !!msg ? '' : (!!table ? _`Table definitions should contain the followings` + `: ${table}` : _`Records should contain the followings`),
        _`Actual:`,
        indent(records.format(obj)),
      ].join('\n'),
      showRecord ? [
        !!msg ? '' : (!!table ? _`Table definitions should not contain the followings` + `: ${table}` : _`Records should not contain the followings`),
        _`Target:`,
        indent(records.format([val].flat())),
        _`Actual:`,
        indent(records.format(obj)),
      ].join('\n') : [
        !!msg ? '' : (!!table ? _`Table definitions should not contain the followings` + `: ${table}` : _`Records should not contain the followings`),
        _`Actual:`,
        indent(records.format(obj)),
      ].join('\n')
    );
  }

  Assertion.addMethod('recordContain', assertRecordContain);

  // with(out)Column -------------------------------
  function withColumn(this: any, columns: any, _msg?: string): void {
    columns = toSetOfLowerCase(columns);
    flag(this, 'withColumn', columns);
  }

  function withoutColumn(this: any, columns: any, _msg?: string): void {
    columns = toSetOfLowerCase(columns);
    flag(this, 'withoutColumn', columns);
  }

  function toSetOfLowerCase(xs: any): Set<string> {
    const typeOfXs = typeOf(xs);
    switch (typeOfXs) {
      case 'string':
        return new Set([xs.toLowerCase()]);
      case 'array':
        return new Set(xs.map((x: string) => x.toLowerCase()));
      default:
        return new Set(Array.from(xs).map((x: any) => x.toLowerCase()));
    }
  }

  function filterColumns(recs: any[], filter: (col: string) => boolean): any[] {
    return recs.map((record: any) => {
      let result: Record<string, any> = {};
      Reflect.ownKeys(record)
        .filter(filter as any)
        .forEach((key: any) => result[key] = record[key]);
      return result;
    });
  }

  Assertion.addMethod('columns', withColumn);
  Assertion.addMethod('without', withoutColumn);

  // orderBy -------------------------------
  function orderBy(this: any, columns: any): void {
    if (typeOf(columns) !== 'array') {
      columns = Array.from(arguments);
    }
    function cmp2(a: any, b: any): number {
      if (!Number.isNaN(Number(a)) && !Number.isNaN(Number(b))) {
        return Number(a) - Number(b);
      } else if (a === null || a === undefined) {
        if (b === null || b === undefined) {
          return 0;
        } else {
          return -1;
        }
      } else if (b === null || b === undefined) {
        return 1;
      } else {
        return a.localeCompare(b);
      }
    }
    const fns = columns.map((column: string) => {
      if (column.startsWith("-")) {
        column = column.substr(1).toLowerCase();
        return (a: any, b: any) => -cmp2(a[column], b[column]);
      } else if (column.startsWith("+")) {
        column = column.substr(1).toLowerCase();
        return (a: any, b: any) => cmp2(a[column], b[column]);
      } else {
        column = column.toLowerCase();
        return (a: any, b: any) => cmp2(a[column], b[column]);
      }
    });
    let recs = records.normalize(flag(this, 'object'));
    recs.sort((a: any, b: any) => {
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
  function assertFullscan(this: any, tables: any, msg?: string): void {
    if (typeOf(tables) !== 'array' && !msg) {
      msg = tables;
      tables = undefined;
    }
    if (!!msg) {
      flag(this, 'message', msg);
    }
    const recs = flag(this, 'object');
    const every = !!flag(this, 'all');
    this.assert(
      fullscan(recs, tables, every),
      !!msg ? '' : _`expected table full scan detected${'\n' + records.format(recs)}`,
      !!msg ? '' : _`expected table full scan not detected${'\n' + records.format(recs)}`,
    );
  }

  function fullscan(recs: any[], tables: string[] | undefined, every: boolean): boolean {
    const re = new RegExp(
      `^SCAN(?: TABLE)? (${(tables || []).join('|') || '\\w+'})`
    );
    return recs[every ? 'every' : 'some']((record: any) => re.test(record.detail));
  }

  Assertion.addMethod('fullscan', assertFullscan);

  /////// Schema Assertions ///////
  function asTable(this: any, table: string): void {
    flag(this, 'table', table);
  }
  Assertion.addMethod('asTable', asTable);
}

assertions.options = {} as { limit?: number };

export = assertions;
