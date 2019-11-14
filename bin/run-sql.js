#!/usr/bin/env node

const dblib = require('..');
const { docopt } = require('docopt');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const _ = dblib.i18n.text;

const usage = `
Runs SQL

Usage:
  run-sql.js [options] <preparation>...
  run-sql.js -h | --help
  
Options:
  -h --help            Show this screen.
  -f --format FORMAT   Formatter to print records [pretty, csv; default: pretty]
`;

(async() => {
	try {
		let args = docopt(usage);
		const conn = new dblib.Connection();
		await conn.prepare(preparation(args['<preparation>']));
		const sqls = (await promisify(fs.readFile)(process.stdin.fd, 'utf8'))
			.split(";")
			.map(sql => sql.trim())
			.filter(sql => sql.length > 0);
		for (let sql of sqls) {
			const records = await conn.query(sql);
			console.log(formatter(args['--format'])(records, sql));
		}
		process.exit(0);
	} catch (e) {
		console.error(e);
		process.exit(1);
	}
})();

function preparation(preps) {
	return preps.map(arg => {
		const split = arg.split(':');
		switch (path.extname(split[0])) {
			case '.csv':
				return { path: split[0], table: split[1] || path.basename(split[0], '') };
			case '.sql':
				return { path: split[0] };
			default:
				return null;
		}
	})
	.filter(arg => !!arg);
}

function indent(str, n = 2) {
	return str.split('\n').map(s => ' '.repeat(n) + s).join('\n');
}

function formatter(formatter) {
	switch (formatter) {
		case 'csv': return (records, sql) => dblib.records.toCSV(records);
		default: return (records, sql) =>
			_`SQL execution result` +
			`:\n${indent(sql)}\n\n${indent('') + records.length} ` +
			_`row(s) selected` + `\n${indent(dblib.records.format(records))}`;
	}
}
