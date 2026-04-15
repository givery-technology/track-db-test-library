import DiffMatchPatch = require('diff-match-patch');
import * as csvjson from 'csvjson';
import * as eaw from 'eaw';
import { text as _ } from './i18n';

function typeOf(x: any): string {
  return Object.prototype.toString.call(x).slice(8, -1).toLowerCase();
}

function flatMap(xs: any[], fn: (x: any) => any[]): any[] {
  return xs.reduce((ys, x) => ys.concat(fn(x)), []);
}

const NULL_MARKER = '__null__';

export function normalize(xs: any): any[] {
  const typeOfXs = typeOf(xs);
  switch (typeOfXs) {
    case 'array':
      return xs.map(normalizeRecord);
    case 'set':
      return Array.from((xs as Set<any>).values()).map(normalizeRecord);
    default:
      return [];
  }
}

function normalizeRecord(x: any): Record<string, any> {
  function build(iter: Iterable<[any, any]>): Record<string, any> {
    const ret: Record<string, any> = {};
    for (const [k, v] of iter) {
      ret[k.toLowerCase()] = normalizeValue(v)[1];
    }
    return ret;
  }

  const typeOfX = typeOf(x);
  switch (typeOfX) {
    case 'object':
      return build(Object.entries(x));
    case 'map':
      return build((x as Map<any, any>).entries());
    default:
      return {};
  }
}

function formatDate(d: Date, f: string = 'YYYY-mm-DD HH:MM:SS'): string {
  return f
    .replace(/YYYY/g, String(d.getFullYear()))
    .replace(/mm/g, (d.getMonth() + 1).toString().padStart(2, '0'))
    .replace(/DD/g, d.getDate().toString().padStart(2, '0'))
    .replace(/HH/g, d.getHours().toString().padStart(2, '0'))
    .replace(/MM/g, d.getMinutes().toString().padStart(2, '0'))
    .replace(/SS/g, d.getSeconds().toString().padStart(2, '0'));
}

function normalizeValue(x: any): [string, any] {
  const typeOfX = typeOf(x);
  switch (typeOfX) {
    case 'number':
    case 'string':
      if (String(x) === NULL_MARKER) {
        return ['null', ''];
      } else {
        return ['string', String(x)];
      }
    case 'boolean':
      return ['boolean', (x as boolean).valueOf()];
    case 'date':
      return ['string', formatDate(x as Date)];
    default:
      return ['null', ''];
  }
}

export function diff(as: any[], bs: any[]): { a: Map<number, string[]>; b: Map<number, string[]> } {
  as = normalize(as);
  bs = normalize(bs);
  let keys: any[] = [];
  const keysSet = new Set<any>();
  Reflect.ownKeys(as[0] || {}).forEach(key => keysSet.add(key));
  Reflect.ownKeys(bs[0] || {}).forEach(key => keysSet.add(key));
  keys = Array.from(keysSet.keys());
  if (keys.length === 0) {
    return { a: new Map(), b: new Map() };
  }

  const data_a = flatMap(as, r => keys.map(k => r[k]));
  const data_b = flatMap(bs, r => keys.map(k => r[k]));

  const dmp = new DiffMatchPatch();
  dmp.Diff_EditCost = 0;
  const meta = dmp.diff_linesToChars_(
    data_a.map((s: any) => !!s && !!s.replace ? s.replace(/\n/, "\uFEFF") : s).join("\n"),
    data_b.map((s: any) => !!s && !!s.replace ? s.replace(/\n/, "\uFEFF") : s).join("\n")
  );
  let diffs: any[] = dmp.diff_main(meta.chars1, meta.chars2, false);
  dmp.diff_charsToLines_(diffs, meta.lineArray);
  diffs = diffs.map((hunk: any) => {
    const value = hunk[1].replace(/\s+$/, "").split("\n")
      .map((s: string) => s.replace(/\uFEFF/, "\n"));
    return {
      added: hunk[0] === 1,
      removed: hunk[0] === -1,
      count: value.length,
      value: value
    };
  });

  const map_a = new Map<number, string[]>();
  const map_b = new Map<number, string[]>();

  function doAppend(map: Map<number, string[]>, line: number, column: any): void {
    if (!map.has(line)) {
      map.set(line, []);
    }
    const entry = map.get(line)!;
    entry.push(column);
  }

  function append(map: Map<number, string[]>, pos: number, length: number): void {
    for (let i = 0; i < length; i++) {
      const line = Math.floor((pos + i) / keys.length);
      const column = keys[(pos + i) % keys.length];
      doAppend(map, line, column);
    }
  }

  let pos_a = 0, pos_b = 0;
  for (let hunk of diffs) {
    if (hunk.removed) {
      append(map_a, pos_a, hunk.count);
      pos_a += hunk.count;
    } else if (hunk.added) {
      append(map_b, pos_b, hunk.count);
      pos_b += hunk.count;
    } else {
      pos_a += hunk.count;
      pos_b += hunk.count;
    }
  }

  return {
    a: map_a,
    b: map_b,
  };
}

export function format(records: any[], option?: { offset?: number; limit?: number; diff?: Map<number, string[]>; success?: boolean }): string {
  let offset = option?.offset ?? 0;
  let limit = option?.limit ?? 10;
  let diffMap = option?.diff ?? new Map<number, string[]>();
  let success = option?.success ?? false;
  records = normalize(records);
  const len = records.length;
  if (!len) {
    return _`No record`;
  }

  let keys: any[];
  try {
    keys = Reflect.ownKeys(records[0]);
  } catch (_e) {
    return _`No record`;
  }
  const limited = records.length > offset + limit;
  records = records.slice(offset, offset + limit);

  const minSize = 10;
  const sizes = keys.map((key: any) => Math.max(minSize, eaw.getWidth(key)));
  records.forEach((result: any) => {
    keys.forEach((key: any, i: number) => {
      if (eaw.isNarrowCharacter(result[key])) {
        sizes[i] = Math.max(sizes[i], eaw.getWidth(result[key]));
      } else {
        sizes[i] = Math.max(sizes[i], eaw.getWidth(result[key]) * 7 / 8);
      }
    });
  });

  let res: string[][] = [];
  res.push(keys.map((_key: any, i: number) => '-'.repeat(sizes[i])));
  res.push(keys.map((key: any, i: number) => String(key).padEnd(sizes[i])));
  res.push(keys.map((_key: any, i: number) => '-'.repeat(sizes[i])));

  if (offset > 0) {
    res.push(keys.map((_key: any, i: number) => `  ..${' '.repeat(sizes[i] - 4)}`));
  }

  records.forEach((record: any, line: number) => {
    line = line + offset;
    const diffColumns = diffMap.get(line) || [];
    let s = "";
    res.push(keys.map((key: any, i: number) => {
      if (eaw.isNarrowCharacter(record[key])) {
        s = String(record[key]).padEnd(sizes[i]);
      } else {
        let spaces = sizes[i] - eaw.getWidth(record[key]) * 7 / 8 + 2;
        s = String(record[key]) + " ".repeat(spaces);
      }
      return diffColumns.includes(key) ?
        (success ? '\x1b[1;32m' : '\x1b[1;31m') + s + '\x1b[00m' : s;
    }));
  });

  if (limited) {
    res.push(keys.map((_key: any, i: number) => `  ..${' '.repeat(sizes[i] - 4)}`));
  }
  res.push(keys.map((_key: any, i: number) => '-'.repeat(sizes[i])));
  return res.map(x => x.join('  ')).join('\n') + '\n';
}

export function toCSV(records: any[]): string {
  return csvjson.toCSV(normalize(records), { headers: 'key' });
}
