#!/usr/bin/env node

const dblib = require('..');
const { docopt } = require('docopt');
const fs = require('fs');
const { promisify } = require('util');
const _ = dblib.i18n.text;

const usage = `
Runs SQL for debug feature of track.

Usage:
  debug
  debug -h | --help

Options:
  -h --help            Show this screen.
`;

(async () => {
	try {
		let _args = docopt(usage);
		const queries = (await promisify(fs.readFile)(process.stdin.fd, 'utf8'))
			.split(/--(?:\s*@load\s+([^\s]+)\s*|---+)\n/)
			.map(block => block.trim())
			.filter(block => !!block)
			.flatMap(block => {
				if (block.endsWith('.csv') || block.endsWith('.sql')) {
					return [block];
				} else {
					return block.split(';')
						.map(sql => sql.trim())
						.filter(sql => !!sql);
				}
			});
		const conn = new dblib.Connection();
		const lastResult = (await conn.queryAll(queries)).slice(-1)[0];
		console.log(format(lastResult.records, lastResult.sql || _`Import from CSV File`, !lastResult.sql));
		process.exit(0);
	} catch (e) {
		console.error(e);
		process.exit(1);
	}
})();


function indent(str, n = 2) {
	return str.split('\n').map(s => ' '.repeat(n) + s).join('\n');
}

function format(records, sql, inserted) {
	return _`SQL execution result` +
		`:\n${indent(sql)}\n\n${indent('') + records.length} ` +
		(inserted ? _`row(s) inserted` : _`row(s) selected`) + `\n${indent(dblib.records.format(records))}`;
}
