const jsdiff = require('diff');

function typeOf(x) {
	return Object.prototype.toString.call(x).slice(8, -1).toLowerCase();
}

function flatMap(xs, fn) {
	return xs.reduce((ys, x) => ys.concat(fn(x)), []);
}

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

function normalizeValue(x) {
	const typeOfX = typeOf(x);
	switch (typeOfX) {
		case 'number':
		case 'string':
			return ['string', String(x)];
		case 'boolean':
			return ['boolean', x.valueOf()];
		default: // undefined, null, object, ...
			return ['null', null];
	}
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
	const keys = Reflect.ownKeys(as[0] || bs[0] || {});
	if (keys.length === 0) {
		return null;
	}

	const data_a = flatMap(as, r => keys.map(k => r[k]));
	const data_b = flatMap(bs, r => keys.map(k => r[k]));

	const diffs = jsdiff.diffArrays(data_a, data_b);
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
	const len = records.length;
	if (!len) {
		return '';
	}

	const keys = Reflect.ownKeys(records[0]);
	const limited = records.length > offset + limit;
	records = records.slice(offset, offset + limit);

	const minSize = 10;
	const sizes = keys.map(key => Math.max(minSize, key.length));
	records.forEach(result => {
		keys.forEach((key, i) => {
			sizes[i] = Math.max(sizes[i], String(result[key]).length);
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
		res.push(keys.map((key, i) => {
			const s = String(record[key]).padEnd(sizes[i]);
			return diffColumns.includes(key) ?
				(success ? '\033[1;32m' : '\033[1;31m') + s + '\033[00m' : s;
			// return s.padEnd(sizes[i]);
		}));
	});

	if (limited) {
		res.push(keys.map((key, i) => `  ..${' '.repeat(sizes[i] - 4)}`));
	}
	res.push(keys.map((key, i) => '-'.repeat(sizes[i])));
	return res.map(x => x.join('  ')).join('\n') + '\n';
}


module.exports = {
	normalize: normalizeRecords,
	diff: diffRecords,
	format: formatRecords,
};
