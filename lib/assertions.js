const records = require('./records');
const _ = require('./i18n.js').text;
const csvjson = require('csvjson');
const fs = require('fs');

module.exports = function(chai, util) {
	const Assertion = chai.Assertion;
	const flag = util.flag;

	function typeOf(x) {
		return Object.prototype.toString.call(x).slice(8, -1).toLowerCase();
	}

	function indent(str, n = 2) {
		return str.split('\n').map(s => ' '.repeat(n) + s).join('\n');
	}

	// assertRecordEqual(ToCsv) -------------------
	function assertRecordEqual(val, msg) {
		doAssertRecordEqual(this, val, msg);
	}

	function assertRecordEqualToCsv(path, msg) {
		doAssertRecordEqual(this, csvjson.toSchemaObject(fs.readFileSync(path, "utf8"), msg));
	}

	function doAssertRecordEqual(self, val, msg) {
		if (!!msg) {
			flag(self, 'message', msg);
		}
		const obj = flag(self, 'object');

		const diff = records.diff(obj, val);
		const ok = diff.a.size === 0 && diff.b.size === 0;
		let offset = ok ? 0 :
			Math.max(Math.min(diff.a.keys().next().value - 2 || Infinity, diff.b.keys().next().value - 2 || Infinity), 0);

		self.assert(
			ok,
			[
				!!msg ? '' : _`Records should equal to expected`,
				_`Expected:`,
				indent(records.format(val, {offset: offset, diff: diff.b, success: true})),
				_`Actual:`,
				indent(records.format(obj, {offset: offset, diff: diff.a}))
			].join('\n'),
			[
				!!msg ? '' : _`Records should not equal to followings`,
				_`Actual:`,
				records.format(obj, offset)
			].join('\n')
		);
	}

	function recordsEqual(a, b) {
		let typeOfA, typeOfB;
		[typeOfA, a] = modifiedTypeOf(a);
		[typeOfB, b] = modifiedTypeOf(b);
		if (typeOfA !== typeOfB) {
			return false;
		}
		switch (typeOfA) {
			case 'undefined':
			case 'null':
				return true;
			case 'string':
				// allow implicit type conversion to make '5' equal to 'new Number(5)'
				return a == b;
			case 'array':
				return arraysEqual(a, b);
			case 'object':
				return objectsEqual(a, b);
			default:
				return a === b;
		}
	}

	function arraysEqual(a, b) {
		if (a.length !== b.length) {
			return false;
		}
		for (let i = 0, len = a.length; i < len; i++) {
			if (!recordsEqual(a[i], b[i])) {
				return false;
			}
		}
		return true;
	}

	function objectsEqual(a, b) {
		a = keysToLower(a);
		b = keysToLower(b);
		if (Reflect.ownKeys(a).length !== Reflect.ownKeys(b).length) {
			return false;
		}
		for (const [key, _] of Object.entries(a)) {
			if(!recordsEqual(a[key], b[key])) {
				return false;
			}
		}
		return true;
	}

	function keysToLower(obj) {
		const ret = {};
		for (const [key, _] of Object.entries(obj)) {
			ret[key.toLowerCase()] = obj[key];
		}
		return ret;
	}

	function modifiedTypeOf(x) {
		const typeOfX = typeOf(x);
		switch (typeOfX) {
			case 'number':
				return ['string', String(x)];
			case 'map':
				return ['object', mapToObject(x)];
			default:
				return [typeOfX, x];
		}
	}

	function mapToObject(map) {
		const ret = {};
		for (const [k, v] of map.entries()) {
			ret[k] = v;
		}
		return ret;
	}

	Assertion.addMethod('recordEqual', assertRecordEqual);
	Assertion.addMethod('recordEqualToCsv', assertRecordEqualToCsv);

	// with(out)Column -------------------------------
	function withColumn(columns, msg) {
		columns = toSetOfLowerCase(columns);
		let records = flag(this, 'object');
		records = filterColumns(records, column => columns.has(column.toLowerCase()));
		flag(this, 'object', records);
	}

	function withoutColumn(columns, msg) {
		columns = toSetOfLowerCase(columns);
		let records = flag(this, 'object');
		records = filterColumns(records, column => !columns.has(column.toLowerCase()));
		flag(this, 'object', records);
	}

	function toSetOfLowerCase(xs) {
		const typeOfXs = typeOf(xs)
		switch (typeOfXs) {
			case 'string':
				return new Set([xs.toLowerCase()]);
			case 'array':
				return new Set(xs.map(x => x.toLowerCase()));
			default:
				return new Set(Array.from(xs).map(x => x.toLowerCase()));
		}
	}

	function filterColumns(records, filter) {
		return records.map(record => {
			let result = {};
			Reflect.ownKeys(record)
				.filter(filter)
				.forEach(key => result[key] = record[key]);
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
			} else {
				return a.localeCompare(b);
			}
		}
		const fns = columns.map(column => {
			if (column.startsWith("-")) {
				column = column.substr(1).toLowerCase();
				return (a, b) => -cmp2(a[column], b[column]);
			} else if (column.startsWith("+")) {
				column = column.substr(1).toLowerCase();
				return (a, b) => cmp2(a[column], b[column]);
			} else {
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
		this.assert(
			fullscan(recs, tables, every),
			!!msg ? '' : _`expected table full scan detected${'\n' + records.format(recs)}`,
			!!msg ? '' : _`expected table full scan not detected${'\n' + records.format(recs)}`,
		);
	}

	function fullscan(records, tables, every) {
		const re = new RegExp(
			`^SCAN TABLE (${(tables || []).join('|') || '\\w+'})($| USING INDEX)`
		);
		return records[every ? 'every' : 'some'](record => re.test(record.detail));
	}

	Assertion.addMethod('fullscan', assertFullscan);
};
