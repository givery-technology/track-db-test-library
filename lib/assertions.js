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
		doAssertRecordEqual(this, records.normalize(csvjson.toSchemaObject(fs.readFileSync(path, "utf8")), msg));
	}

	function doAssertRecordEqual(self, val, msg) {
		if (!!msg) {
			flag(self, 'message', msg);
		}
		let obj = flag(self, 'object');
		const withColumn = flag(self, 'withColumn');
		if (!!withColumn) {
			obj = filterColumns(obj, column => withColumn.has(column.toLowerCase()));
			const errormsg = _`Records should contain every columns: ` + Array.from(withColumn.keys()).join();
			self.assert(
				obj.every(record => Reflect.ownKeys(record).length === withColumn.size),
				errormsg, errormsg
			);
			val = filterColumns(val, column => withColumn.has(column.toLowerCase()));
		}
		const withoutColumn = flag(self, 'withoutColumn');
		if (!!withoutColumn) {
			obj = filterColumns(obj, column => !withoutColumn.has(column.toLowerCase()));
			val = filterColumns(val, column => !withoutColumn.has(column.toLowerCase()));
		}

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

	Assertion.addMethod('recordEqual', assertRecordEqual);
	Assertion.addMethod('recordEqualToCsv', assertRecordEqualToCsv);

	// with(out)Column -------------------------------
	function withColumn(columns, msg) {
		columns = toSetOfLowerCase(columns);
		flag(this, 'withColumn', columns);
	}

	function withoutColumn(columns, msg) {
		columns = toSetOfLowerCase(columns);
		flag(this, 'withoutColumn', columns);
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
			`^SCAN TABLE (${(tables || []).join('|') || '\\w+'})`
		);
		return records[every ? 'every' : 'some'](record => re.test(record.detail));
	}

	Assertion.addMethod('fullscan', assertFullscan);
};
