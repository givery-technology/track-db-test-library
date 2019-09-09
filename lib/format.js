const _ = require('./i18n').text;

function typeOf(x) {
	return Object.prototype.toString.call(x).slice(8, -1).toLowerCase();
}

/**
 * Format records as a table style
 * @param {string} [message]
 * @param {string} [sql]
 * @param {array<object>} records
 * @returns {string}
 */
function formatRecords(message, sql, records) {
	switch (typeOf(message)) {
		case 'string':
			if (typeOf(sql) !== 'string') {
				records = sql;
				sql = message;
				message = _`SQL execution result`;
			}
			return `${message}:\n${indent(sql)}\n\n${indent('') + records.length} ` +
				_`row(s) selected` + `\n${indent(doFormatRecords(records))}`;
		case 'array':
			records = message;
			return doFormatRecords(records);
	}

}

function indent(str, n = 2) {
	return str.split('\n').map(s => ' '.repeat(n) + s).join('\n');
}

function doFormatRecords(results, limit = 20) {
	const len = results.length;
	if (!len) {
		return '';
	}
	const keys = Reflect.ownKeys(results[0]);
	const limited = results.length > limit;
	results = results.slice(0, limit);

	const minSize = 10;
	const sizes = keys.map(key => Math.max(minSize, key.length));
	results.forEach(result => {
		keys.forEach((key, i) => {
			sizes[i] = Math.max(sizes[i], String(result[key]).length);
		});
	});

	let res = [];
	res.push(keys.map((key, i) => '-'.repeat(sizes[i])));
	res.push(keys.map((key, i) => key.padEnd(sizes[i])));
	res.push(keys.map((key, i) => '-'.repeat(sizes[i])));
	results.forEach(function (result) {
		res.push(keys.map((key, i) => String(result[key]).padEnd(sizes[i])));
	});

	if (limited) {
		res.push(keys.map((key, i) => `  ..${' '.repeat(sizes[i] - 4)}`));
	}
	res.push(keys.map((key, i) => '-'.repeat(sizes[i])));
	return res.map(x => x.join('  ')).join('\n') + '\n';
}

module.exports = {
	records: formatRecords
};
