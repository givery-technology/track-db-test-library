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
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalize = normalize;
exports.diff = diff;
exports.format = format;
exports.toCSV = toCSV;
const DiffMatchPatch = require("diff-match-patch");
const csvjson = __importStar(require("csvjson"));
const eaw = __importStar(require("eaw"));
const i18n_1 = require("./i18n");
function typeOf(x) {
    return Object.prototype.toString.call(x).slice(8, -1).toLowerCase();
}
function flatMap(xs, fn) {
    return xs.reduce((ys, x) => ys.concat(fn(x)), []);
}
const NULL_MARKER = '__null__';
function normalize(xs) {
    const typeOfXs = typeOf(xs);
    switch (typeOfXs) {
        case 'array':
            return xs.map(normalizeRecord);
        case 'set':
            return Array.from(xs.values()).map(normalizeRecord);
        default:
            return [];
    }
}
function normalizeRecord(x) {
    function build(iter) {
        const ret = {};
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
            return build(x.entries());
        default:
            return {};
    }
}
function formatDate(d, f = 'YYYY-mm-DD HH:MM:SS') {
    return f
        .replace(/YYYY/g, String(d.getFullYear()))
        .replace(/mm/g, (d.getMonth() + 1).toString().padStart(2, '0'))
        .replace(/DD/g, d.getDate().toString().padStart(2, '0'))
        .replace(/HH/g, d.getHours().toString().padStart(2, '0'))
        .replace(/MM/g, d.getMinutes().toString().padStart(2, '0'))
        .replace(/SS/g, d.getSeconds().toString().padStart(2, '0'));
}
function normalizeValue(x) {
    const typeOfX = typeOf(x);
    switch (typeOfX) {
        case 'number':
        case 'string':
            if (String(x) === NULL_MARKER) {
                return ['null', ''];
            }
            else {
                return ['string', String(x)];
            }
        case 'boolean':
            return ['boolean', x.valueOf()];
        case 'date':
            return ['string', formatDate(x)];
        default:
            return ['null', ''];
    }
}
function diff(as, bs) {
    as = normalize(as);
    bs = normalize(bs);
    let keys = [];
    const keysSet = new Set();
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
    const meta = dmp.diff_linesToChars_(data_a.map((s) => !!s && !!s.replace ? s.replace(/\n/, "\uFEFF") : s).join("\n"), data_b.map((s) => !!s && !!s.replace ? s.replace(/\n/, "\uFEFF") : s).join("\n"));
    let diffs = dmp.diff_main(meta.chars1, meta.chars2, false);
    dmp.diff_charsToLines_(diffs, meta.lineArray);
    diffs = diffs.map((hunk) => {
        const value = hunk[1].replace(/\s+$/, "").split("\n")
            .map((s) => s.replace(/\uFEFF/, "\n"));
        return {
            added: hunk[0] === 1,
            removed: hunk[0] === -1,
            count: value.length,
            value: value
        };
    });
    const map_a = new Map();
    const map_b = new Map();
    function doAppend(map, line, column) {
        if (!map.has(line)) {
            map.set(line, []);
        }
        const entry = map.get(line);
        entry.push(column);
    }
    function append(map, pos, length) {
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
        }
        else if (hunk.added) {
            append(map_b, pos_b, hunk.count);
            pos_b += hunk.count;
        }
        else {
            pos_a += hunk.count;
            pos_b += hunk.count;
        }
    }
    return {
        a: map_a,
        b: map_b,
    };
}
function format(records, option) {
    var _a, _b, _c, _d;
    let offset = (_a = option === null || option === void 0 ? void 0 : option.offset) !== null && _a !== void 0 ? _a : 0;
    let limit = (_b = option === null || option === void 0 ? void 0 : option.limit) !== null && _b !== void 0 ? _b : 10;
    let diffMap = (_c = option === null || option === void 0 ? void 0 : option.diff) !== null && _c !== void 0 ? _c : new Map();
    let success = (_d = option === null || option === void 0 ? void 0 : option.success) !== null && _d !== void 0 ? _d : false;
    records = normalize(records);
    const len = records.length;
    if (!len) {
        return (0, i18n_1.text) `No record`;
    }
    let keys;
    try {
        keys = Reflect.ownKeys(records[0]);
    }
    catch (_e) {
        return (0, i18n_1.text) `No record`;
    }
    const limited = records.length > offset + limit;
    records = records.slice(offset, offset + limit);
    const minSize = 10;
    const sizes = keys.map((key) => Math.max(minSize, eaw.getWidth(key)));
    records.forEach((result) => {
        keys.forEach((key, i) => {
            if (eaw.isNarrowCharacter(result[key])) {
                sizes[i] = Math.max(sizes[i], eaw.getWidth(result[key]));
            }
            else {
                sizes[i] = Math.max(sizes[i], eaw.getWidth(result[key]) * 7 / 8);
            }
        });
    });
    let res = [];
    res.push(keys.map((_key, i) => '-'.repeat(sizes[i])));
    res.push(keys.map((key, i) => String(key).padEnd(sizes[i])));
    res.push(keys.map((_key, i) => '-'.repeat(sizes[i])));
    if (offset > 0) {
        res.push(keys.map((_key, i) => `  ..${' '.repeat(sizes[i] - 4)}`));
    }
    records.forEach((record, line) => {
        line = line + offset;
        const diffColumns = diffMap.get(line) || [];
        let s = "";
        res.push(keys.map((key, i) => {
            if (eaw.isNarrowCharacter(record[key])) {
                s = String(record[key]).padEnd(sizes[i]);
            }
            else {
                let spaces = sizes[i] - eaw.getWidth(record[key]) * 7 / 8 + 2;
                s = String(record[key]) + " ".repeat(spaces);
            }
            return diffColumns.includes(key) ?
                (success ? '\x1b[1;32m' : '\x1b[1;31m') + s + '\x1b[00m' : s;
        }));
    });
    if (limited) {
        res.push(keys.map((_key, i) => `  ..${' '.repeat(sizes[i] - 4)}`));
    }
    res.push(keys.map((_key, i) => '-'.repeat(sizes[i])));
    return res.map(x => x.join('  ')).join('\n') + '\n';
}
function toCSV(records) {
    return csvjson.toCSV(normalize(records), { headers: 'key' });
}
