const DiffMatchPatch = require('diff-match-patch');
const csvjson = require('csvjson');
const eaw = require("eaw");

function typeOf(x) {
	return Object.prototype.toString.call(x).slice(8, -1).toLowerCase();
}

function flatMap(xs, fn) {
	return xs.reduce((ys, x) => ys.concat(fn(x)), []);
}

const NULL_MARKER = '__null__';

/**
 * Normalize records
 * - keys -> to lower case
 * - values -> primitive values, number -> string / string, boolean -> (noop) / others -> null
 * @param xs
 * @return {object<string,(string|boolean|null)>[]}
 */

function normalizeRecords(xs) {
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
			return build(map.entries());
		default:
			return {};
	}
}

function formatDate(d, f = 'YYYY-mm-DD HH:MM:SS') {
	return f
		.replace(/YYYY/g, d.getFullYear())
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
			} else {
				return ['string', String(x)];
			}
		case 'boolean':
			return ['boolean', x.valueOf()];
		case 'date':
			return ['string', formatDate(x)];
		default: // undefined, null, object, ...
			return ['null', ''];
	}
}

function modifyRecordsForOutput(xs) {
	return xs.map(x => {
		let y = Object.assign({}, x);
		Reflect.ownKeys(y).forEach(key => {
			if (y[key] === null) {
				y[key] = NULL_MARKER;
			}
		});
	});
}

/**
 * create diffs for given 2 records
 * @param as
 * @param bs
 * @return {null|{a: Map<number, string[]>[], b: Map<number, string[]>[]}}
 */
function diffRecords(as, bs) {
	as = normalizeRecords(as);
	bs = normalizeRecords(bs);
	let keys = new Set();
	Reflect.ownKeys(as[0] || {}).forEach(key => keys.add(key));
	Reflect.ownKeys(bs[0] || {}).forEach(key => keys.add(key));
	keys = Array.from(keys.keys());
	if (keys.length === 0) {
		return null;
	}

	const data_a = flatMap(as, r => keys.map(k => r[k]));
	const data_b = flatMap(bs, r => keys.map(k => r[k]));

	const dmp = new DiffMatchPatch();dmp.Diff_EditCost = 0;
	const meta = dmp.diff_linesToChars_(
		data_a.map(s => !!s && !!s.replace ? s.replace(/\n/, "\uFEFF"): s).join("\n"),
		data_b.map(s => !!s && !!s.replace ? s.replace(/\n/, "\uFEFF"): s).join("\n")
	);
	let diffs = dmp.diff_main(meta.chars1, meta.chars2, false);
	dmp.diff_charsToLines_(diffs, meta.lineArray);
	diffs = diffs.map(hunk => {
		const value = hunk[1].replace(/\s+$/,"").split("\n")
			.map(s => s.replace(/\uFEFF/, "\n"));
		return {
			added: hunk[0] === 1,
			removed: hunk[0] === -1,
			count: value.length,
			value: value
		}
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


/**
 * @param {object<string,(string|boolean|null)>[]} records
 * @param {{offset: number?, limit: number?, diff: Map<number,string[]>?}, success: boolean} [option]
 * @return {string}
 */
function formatRecords(records, option) {
	let { offset, limit, diff, success } = Object.assign({
		offset: 0,
		limit: 10,
		diff: new Map(),
		success: false,
	}, (option || {}));
	records = normalizeRecords(records);
	const len = records.length;
	if (!len) {
		return '';
	}

	let keys;
	try {
		keys = Reflect.ownKeys(records[0]);
	} catch (_) {
		return '';
	}
	const limited = records.length > offset + limit;
	records = records.slice(offset, offset + limit);

	const minSize = 10;
	const sizes = keys.map(key => Math.max(minSize, eaw.getWidth(key)));
	records.forEach(result => {
		keys.forEach((key, i) => {
			if (eaw.isNarrowCharacter(result[key])) {
				sizes[i] = Math.max(sizes[i], eaw.getWidth(result[key]));
			} else {
				sizes[i] = Math.max(sizes[i], eaw.getWidth(result[key]) * 7 / 8);
			}
		});
	});

	let res = [];
	res.push(keys.map((key, i) => '-'.repeat(sizes[i])));
	res.push(keys.map((key, i) => key.padEnd(sizes[i])));
	res.push(keys.map((key, i) => '-'.repeat(sizes[i])));

	if (offset > 0) {
		res.push(keys.map((key, i) => `  ..${' '.repeat(sizes[i] - 4)}`));
	}

	records.forEach((record, line) => {
		line = line + offset;
		const diffColumns = diff.get(line) || [];
		let s = "";
		res.push(keys.map((key, i) => {
			if (eaw.isNarrowCharacter(record[key])) {
				s = String(record[key]).padEnd(sizes[i])
			} else {
				let spaces = sizes[i] - eaw.getWidth(record[key]) * 7/8 + 2;
				s = String(record[key]) + " ".repeat(spaces);
			}
			return diffColumns.includes(key) ?
				(success ? '\033[1;32m' : '\033[1;31m') + s + '\033[00m' : s;
		}));
	});

	if (limited) {
		res.push(keys.map((key, i) => `  ..${' '.repeat(sizes[i] - 4)}`));
	}
	res.push(keys.map((key, i) => '-'.repeat(sizes[i])));
	return res.map(x => x.join('  ')).join('\n') + '\n';
}

function toCSV(records) {
	return csvjson.toCSV((normalizeRecords(records)), {headers: 'key'});
}


module.exports = {
	normalize: normalizeRecords,
	diff: diffRecords,
	format: formatRecords,
	toCSV: toCSV,
};
