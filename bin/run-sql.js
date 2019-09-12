#!/bin/sh

const dblib = require('..');
const { docopt } = require('docopt');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const _ = dblib.i18n.text;

const usage = `
Runs SQL

Usage:
  run-sql.js <preparation>...
  run-sql.js -h | --help
  
Options:
  -h --help   Show this screen.
`;

(async() => {
	try {
		let args = docopt(usage);
		const conn = new dblib.Connection();
		const sql = await promisify(fs.readFile)(process.stdin.fd, 'utf8');
		await conn.prepare(preparation(args['<preparation>']));
		const records = await conn.query(sql);
		const msg = _`SQL execution result` +
			`:\n${indent(sql)}\n\n${indent('') + records.length} ` +
			_`row(s) selected` + `\n${indent(dblib.records.format(records))}`;
		console.log(msg);
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
