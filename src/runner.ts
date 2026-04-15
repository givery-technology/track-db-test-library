import { text as _, message as __ } from './i18n';
import { Connection } from './connection';
import { parse as parseYaml } from 'yaml';
import assertions from './assertions';
import { format } from './records';
import * as chai from 'chai';
import * as fs from 'fs';
import { promisify } from 'util';
import { applyTemplate } from './util';
import { performance } from 'perf_hooks';

declare function describe(title: string, fn: (this: any) => void): void;
declare function it(title: string, fn: (this: any) => void | Promise<void>): void;

// Augment chai assertion types for custom methods
declare global {
  namespace Chai {
    interface Assertion {
      fullscan(tables?: any, msg?: string): Assertion;
      recordEqual(val: any, msg?: string): Assertion;
      recordEqualToCsv(path: string, msg?: string): Assertion;
      recordContain(val: any, msg?: string): Assertion;
      columns(cols: any, msg?: string): Assertion;
      without(cols: any, msg?: string): Assertion;
      orderBy(cols: any): Assertion;
      asTable(table: string): Assertion;
    }
  }
}

const expect = chai.expect;

chai.use(assertions);

// polyfill for Node v10
if (!(Array.prototype as any).flat) {
  (Array.prototype as any).flat = function(depth: number) {
    var flattend: any[] = [];
    (function flat(array: any[], depth: number) {
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
if (!(Array.prototype as any).flatMap) {
  (Array.prototype as any).flatMap = function() {
    return Array.prototype.map.apply(this, arguments as any).flat(1);
  };
}

const REGEXP_INDEX = /CREATE\s+INDEX\s+([A-Za-z0-9_]+)\s+ON\s+([A-Za-z0-9_]+)\s*\(([A-Za-z0-9_,\s]+)\)/i;

async function precheck(conn: Connection, precheckObj: any): Promise<void> {
  if (!!precheckObj.not_empty) {
    await Promise.all(
      [precheckObj.not_empty].flat().map(async (target: string) => {
        const sqls = (await promisify(fs.readFile)(target, 'utf-8'))
          .split('\n')
          .map((s: string) => s.replace(/--.*$/, '').trim())
          .join('\n')
          .split(';')
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0);
        expect(sqls, _`No SQL found` + `: ${target}`).not.empty;
      })
    );
  }
  if (!!precheckObj.one_command) {
    await Promise.all(
      [precheckObj.one_command].flat().map(async (target: string) => {
        const sqls = (await promisify(fs.readFile)(target, 'utf-8'))
          .split('\n')
          .map((s: string) => s.replace(/--.*$/, '').trim())
          .join('\n')
          .split(';')
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0);
        expect(sqls, _`The number of SQL sentences is not 1` + `: ${target}`).to.be.lengthOf(1);
      })
    );
  }
  if (!!precheckObj.ecma) {
    const obj = eval(precheckObj.ecma);
    if (typeof obj === 'function') {
      await obj(conn);
    }
  }
}

async function checkEcma(conn: Connection, script: string): Promise<void> {
  const obj = eval(script);
  if (typeof obj === 'function') {
    await obj(conn);
  }
}

async function checkNoFullscan(conn: Connection, sql: string): Promise<void> {
  expect(sql, _`No SQL found that returns results`).to.exist;
  expect(await conn.query(`EXPLAIN QUERY PLAN ${sql}`)).not.to.have.fullscan();
}

async function checkLastQuery(conn: Connection, check: any, records: any[], asTable?: string): Promise<void> {
  let msg = __(check.message);
  if (!!check.column_list) {
    msg = msg || _`Output order of the columns must match the expected`;
  }
  const target_records = !!check.column_list ?
    Object.keys(records[0]).map((name: string, i: number) => ({ order: i + 1, name })) :
    records;
  let e0 = () => expect(target_records);
  let e1 = !!check.order_by ? () => (e0() as any).orderBy(check.order_by) : e0;
  let e2 = !!check.columns  ? () => (e1() as any).columns(check.columns)  : e1;
  let e3 = !!check.without  ? () => (e2() as any).without(check.without)  : e2;

  let e = !!asTable ? () => (e3() as any).asTable(asTable) : e3;

  await doCheckLastQuery(conn, check, e, true, target_records, msg);
}

async function doCheckLastQuery(conn: Connection, check: any, e: () => any, positive: boolean, records: any[], msg: string | undefined): Promise<void> {
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
    function lengthError(number: any, prePosi: any, postPosi: any, preNega: any, postNega: any): string {
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

function isString(value: any): boolean {
  return typeof value === "string" || value instanceof String;
}

function range(r: any): (x: number) => boolean {
  if (typeof r === 'number') {
    return (x: number) => x === r;
  }
  const lb =
    !!r.gt ? (x: number) => x > r.gt :
      !!r.ge ? (x: number) => x >= r.ge :
        (_x: number) => true;
  const ub =
    !!r.lt ? (x: number) => x < r.lt :
      !!r.le ? (x: number) => x <= r.le :
        (_x: number) => true;
  return (x: number) => lb(x) && ub(x);
}

async function checkIndex(conn: Connection, check: any): Promise<void> {
  let sql = `SELECT * FROM sqlite_master WHERE type = 'index'`;
  if (!!check.index.table) {
    sql = `${sql} AND tbl_name = ${check.index.table}`;
  }
  const index_sqls = (await conn.query(sql))
    .map((record: any) => record.sql)
    .map((s: string) => REGEXP_INDEX.exec(s));
  if (!!check.index.total) {
    expect(range(check.index.total)(index_sqls.length), _`Total number of indexes is out of specification` + `: ${index_sqls.map((xs: any) => xs && xs[1]).join(', ') || _`No index`}`).to.be.true;
  }
  if (!!check.index.column) {
    const columns = index_sqls.flatMap((xs: any) => xs ? xs[3].split(',').map((x: string) => x.trim()) : []);
    expect(range(check.index.column)(columns.length), _`Total number of indexed columns is out of specification` + `: ${columns.join(', ') || _`No index`}`).to.be.true;
  }
}

async function checkAutoIncrement(conn: Connection, check: any): Promise<void> {
  const data = (check.data instanceof Array) ? check.data : [check.data];
  let randomId = isFinite(check.start) ? Number(check.start) : 1;
  for (let i = 0; i < data.length; i++) {
    randomId += Math.floor(Math.random() * 9000) + 1000;
    await conn.updateAutoIncrement(check.table, check.column, randomId);
    const isDataString = typeof data[i] === 'string' || data[i] instanceof String;
    let actual: any;
    if (isDataString) {
      await conn.queryAll([data[i]]);
      actual = (await conn.lastValue(check.table, check.column))[0];
    } else {
      actual = (await (conn.conn as any).insert(
        data[i],
        ['*'],
      ).into(check.table))[0];
    }
    expect(actual[check.column], _`Auto increment value is not used`).to.equal(randomId + 1);

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

async function checkLastSql(conn: Connection, check: any, sql: string): Promise<void> {
  if (!!check.match) {
    const matches = (check.match instanceof Array) ? check.match : [check.match];
    for (const m of matches) {
      let fn: (s: string) => boolean;
      let msg = __(check.message);
      if (m.startsWith && m.startsWith("/")) {
        const re = eval(m);
        fn = (s: string) => re.test(s);
        msg = msg || _`The last SQL should match the following regular expression` + ': ' + m;
      } else {
        fn = eval(m);
        msg = msg || _`The last SQL should be accepted by the following predicate function` + ': ' + m;
      }
      expect(sql, msg).to.satisfy(fn);
    }
  }
}

async function checkError(conn: Connection, check: any): Promise<void> {
  function messageOf(msg: string): string {
    if (!!check.message) {
      return __(check.message) || '';
    } else if (!!check.expected) {
      return msg + _`.` + '\n  ' +
        _`SQL` + ': ' + check.sql + '\n  ' +
        _`Expected error` + ': ' + (__(`__sqle_${check.expected}__`) || '');
    } else {
      return msg;
    }
  }

  try {
    await conn.queryAll([check.sql]);
    expect.fail(messageOf(_`No error detected`));
  } catch (e: any) {
    if (e.name === 'AssertionError') {
      throw e;
    }
    const err = conn.errorOf(e);
    if (check.expected) {
      expect(err[0], messageOf(_`Unexpected error detected`)).to.eql(check.expected);
      if (check.claim) {
        let claims = Array.isArray(check.claim) ? check.claim : [check.claim];
        for (let claim of claims) {
          let fn: (s: string) => boolean;
          if (claim.startsWith('/')) {
            fn = (s: string) => eval(claim).test(s);
          } else {
            fn = (s: string) => s.trim() === claim.trim();
          }
          expect(err[1], messageOf(_`An error with different conditions is detected`)).to.satisfy(fn);
        }
      }
    }
  }
}

async function checkPerformance(conn: Connection, check: any): Promise<void> {
  function messageOf(): string {
    return (
      !!check.message ? (__(check.message) || '') : _`Execution time is too long`
    ) + '\n  ' + _`SQL` + ': ' + check.sql;
  }

  const start = performance.now();
  await conn.queryAll([check.sql].flat());
  const end = performance.now();
  expect(end - start, messageOf()).at.most(Number(check.threshold) || 200);
}

function preprocess(testcase: any): any[] {
  const now = new Date().toISOString();
  function buildProps(props: any, defaults?: any): any {
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
    return testcase.foreach.map((props: any) => applyTemplate(buildProps(props, testcase.default), testcase.template));
  } else {
    return [applyTemplate(buildProps(undefined), testcase)];
  }
}

export class TestRunner {
  lang: string;
  yaml: any;

  constructor(lang: string, yaml: string | any) {
    this.lang = lang;
    if (typeof yaml === 'string') {
      this.yaml = parseYaml(fs.readFileSync(yaml, 'utf-8'));
    } else {
      this.yaml = yaml;
    }
  }

  runAll(): void {
    const settings = this.yaml.settings ?? {};

    const max_display_rows = settings.max_display_rows;
    if (max_display_rows === 'unlimited') {
      assertions.options.limit = Infinity;
    } else if (isFinite(max_display_rows)) {
      assertions.options.limit = Number(max_display_rows);
    }

    for (let testcase of this.yaml.testcases) {
      preprocess(testcase).forEach((tc: any) => {
        this.run(tc);
      });
    }
  }

  run(testcase: any): void {
    const self = this;
    describe("", function() {
      this.timeout(Connection.timeout(self.yaml.client, testcase.timeout));
      it(__(testcase.title) || '', async () => {
        async function doTest(tc: any): Promise<void> {
          let conn: Connection | undefined;
          try {
            conn = await Connection.new({ client: self.yaml.client, clean: true, file: ':memory:' });
            if (!!tc.precheck) {
              await precheck(conn, tc.precheck);
            }

            let { records: recs, sql } = (await conn.queryAll((tc.exec || []).flat())).slice(-1)[0];
            let asTable: string | undefined;

            if (tc.table && (typeof tc.table === 'string' || tc.table instanceof String)) {
              sql = '';
              recs = await conn.tableSchema(tc.table);
              asTable = tc.table;
            }

            const checks = tc.check.length ? tc.check : [tc.check];
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
                await checkLastQuery(conn, check, recs, asTable);
              }
            }
          } finally {
            if (conn) {
              await conn.close();
            }
          }
        }

        if (!!testcase.all) {
          for (let tc of testcase.all) {
            await doTest(tc);
          }
        } else {
          await doTest(testcase);
        }
      });
    });
  }
}

function indent(str: string, n: number = 2): string {
  return str.split('\n').map(s => ' '.repeat(n) + s).join('\n');
}

export default TestRunner;
