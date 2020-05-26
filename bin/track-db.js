#!/usr/bin/env node

const YAML = require('yaml');
const dblib = require('..');
const { docopt } = require('docopt');
const path = require('path');
const { promisify } = require('util');
const _ = dblib.i18n.text;
const _fs = require('fs');

const fs = { // fs.promises is not stable in Node v10
	mkdir: promisify(_fs.mkdir),
	stat: promisify(_fs.stat),
	readFile: promisify(_fs.readFile),
	readdir: promisify(_fs.readdir),
	writeFile: promisify(_fs.writeFile),
};

const USAGE = `
Command line tool for track database challenges

Usage:
  track-db debug [--client=<client>] [--clean] [--csv]
  track-db migrate-track-yml [<track.yml> -- <test.public.yml>... -- <test.secret.yml>...]
  track-db dump [--client=<client>] [--dir=<directory>]
  track-db -h | --help

Options:
  --clean   Remove all objects before execution.
  -c --client <client>   Kind of Database Client [sqlite, postgres; default sqlite]
`;

(async () => {
	let args = docopt(USAGE);
	if (args['debug']) {
		await debug(args['--client'], args['--clean'], args['--csv']);
	} else if (args['migrate-track-yml']) {
		await migrateTrackYml(args['<track.yml>'], args['<test.public.yml>'], args['<test.secret.yml>']);
	} else if (args['dump']) {
		await dump(args['--client'], args['--dir'])
	}
})().then(
	() => process.exit(0),
	e => {
		console.error(e);
		process.exit(1);
	},
);

async function debug(client, clean, csv) {
	const queries = (await fs.readFile(process.stdin.fd, 'utf-8'))
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
	const option = { client };
	if (clean) {
		option.clean = true;
	}
	const conn = await dblib.Connection.new(option);
	const lastResult = (await conn.queryAll(queries)).slice(-1)[0];
	console.log(formatter(csv ? 'csv' : 'default')(lastResult.records, lastResult.sql || _`Import from CSV File`, !lastResult.sql));


	function formatter(formatter) {
		switch (formatter) {
			case 'csv': return (records, sql) => dblib.records.toCSV(records);
			default: return (records, sql) =>
				_`SQL execution result` +
				`:\n${indent(sql)}\n\n${indent('') + records.length} ` +
				_`row(s) selected` + `\n${indent(dblib.records.format(records))}`;
		}
	}
}

async function migrateTrackYml(trackYml, publicTestcasesYml, secretTestcasesYml) {
	trackYml = trackYml || path.join(process.cwd(), 'track.yml');
	const testdir = await fs.readdir(path.join(process.cwd(), 'test'), 'utf-8');
	publicTestcasesYml = (!!publicTestcasesYml && publicTestcasesYml.length) > 0 ? publicTestcasesYml :
		testdir
			.filter(f => f.indexOf('public') > -1 && f.endsWith('.yml'))
			.map(f => path.join(process.cwd(), 'test', f));
	secretTestcasesYml = (!!secretTestcasesYml && secretTestcasesYml.length) > 0 ? secretTestcasesYml :
		testdir
			.filter(f => f.indexOf('secret') > -1 && f.endsWith('.yml'))
			.map(f => path.join(process.cwd(), 'test', f));

	const publicTestcases = (await Promise.all(publicTestcasesYml
		.map(path => fs.readFile(path, 'utf-8'))))
		.flatMap(yml => YAML.parse(yml).testcases);
	const secretTestcases = (await Promise.all(secretTestcasesYml
		.map(path => fs.readFile(path, 'utf-8'))))
		.flatMap(yml => YAML.parse(yml).testcases);
	const debugTestcases = publicTestcases
		.filter(testcase => testcase.debug !== false);

	const input = debugTestcases.map(testcase => {
		const exec = testcase.exec.flat();
		let last = exec.pop();
		if (testcase.check.no_fullscan) {
			last = `EXPLAIN QUERY PLAN\n${_fs.readFileSync(last, 'utf-8')}`;
		}
		return `[${testcase.title.ja || testcase.title}]${
			exec.map(item => `-- @load ${item}`).join('\n')
			}\n${last}`
	});
	const trackYmlContent = YAML.parse(await promisify(fs.readFile)(trackYml, 'utf-8'));
	trackYmlContent.debug = {
		command: (trackYmlContent.debug || {}).command || ('cat $f | debug --clean' + (!!trackYmlContent.client ? ` --client ${trackYmlContent.client}`: '')),
		input: input
	};
	trackYmlContent.testcases = {
		open: publicTestcases.length,
		secret: secretTestcases.length,
	};
	await fs.writeFile(trackYml, YAML.stringify(trackYmlContent), 'utf-8');
}

async function dump(client, directory) {
	directory = directory || 'init';

	console.log(`The database '${dbfile}' will be dumped into '${directory}'...`);
	if (!!client && client !== 'sqlite') {
		// TODO: Lower priority; as this feature is for coaches convenience, will be implemented later.
		throw Error(`Unsupported Database Type: ${client}`);
	}

	const conn = await dblib.Connection.new({ client });

	const create_sql = (await conn.query("SELECT sql FROM sqlite_master WHERE type <> 'table' OR name <> 'sqlite_sequence'"))
		.map(record => record.sql + ';\n')
		.join('');
	await fs.mkdir(directory, { recursive: true });
	await fs.writeFile(path.join(directory, 'create_db.sql'), create_sql);
	console.log(`* Table definitions are successfully dumped into '${path.join(directory, 'create_db.sql')}'`);

	const tables = (await conn.query("SELECT DISTINCT name FROM sqlite_master WHERE type == 'table' AND name <> 'sqlite_sequence'"))
		.map(record => record.name);
	for (let table of tables) {
		const records = (await conn.query(`SELECT * FROM ${table};`));
		if (records.length == 0) {
			console.log(`* Skipped '${table}' table because it has no records`);
			continue;
		}
		const csv = dblib.records.toCSV(records);
		await fs.writeFile(path.join(directory, `${table}.csv`), csv);
		console.log(`* Table '${table}' is successfully dumped into '${path.join(directory, table)}.csv'`);
	}

	console.log(`Finished.`);
}

function indent(str, n = 2) {
	return str.split('\n').map(s => ' '.repeat(n) + s).join('\n');
}
