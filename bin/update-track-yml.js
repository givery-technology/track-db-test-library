#!/usr/bin/env node

const YAML = require('yaml');
const dblib = require('..');
const { docopt } = require('docopt');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const _ = dblib.i18n.text;

// polyfill for Node v10
if (!Array.prototype.flat) {
	Array.prototype.flat = function(depth) {
		var flattend = [];
		(function flat(array, depth) {
			for (let el of array) {
				if (Array.isArray(el) && depth > 0) {
					flat(el, depth - 1);
				} else {
					flattend.push(el);
				}
			}
		})(this, Math.floor(depth) || 1);
		return flattend;
	};
}
if (!Array.prototype.flatMap) {
	Array.prototype.flatMap = function() {
		return Array.prototype.map.apply(this, arguments).flat(1);
	};
}

const usage = `
Updates track.yml from the runner setting file

Usage:
  update-track-yml
  update-track-yml <track.yml> -- <test.yml>...
  update-track-yml | --help
  
Options:
  -h --help            Show this screen.
`;

(async () => {
	try {
		let args = await parse(docopt(usage));
		const testcases = (await Promise.all(args.test_ymls
			.map(path => promisify(fs.readFile)(path, 'utf-8'))))
			.flatMap(yml => YAML.parse(yml).testcases)
			.filter(testcase => testcase.debug !== false);
		// console.log(testcases);
		const input = testcases.map(testcase => {
			const exec = testcase.exec.flat();
			let last = exec.pop();
			if (last.endsWith('.sql')) {
				last = fs.readFileSync(last, 'utf-8');
			}
			if (testcase.check.no_fullscan) {
				last = `EXPLAIN QUERY PLAN\n${last}`;
			}
			return `[${testcase.title.ja || testcase.title}]${
				exec.map(item => `-- @load ${item}`).join('\n')
			}\n${last}`
		});
		const track_yml = YAML.parse(await promisify(fs.readFile)(args.track_yml, 'utf-8'));
		track_yml.debug = {
			command: track_yml.debug.command || 'cat $f | debug',
			input: input
		};
		await promisify(fs.writeFile)(args.track_yml, YAML.stringify(track_yml), 'utf-8');
		process.exit(0);
	} catch (e) {
		console.error(e);
		process.exit(1);
	}
})();

async function parse(args) {
	const track_yml = args['<track.yml>'] ||
		path.join(process.cwd(), 'track.yml');
	const test_ymls = args['<test.yml>'].length > 0 ? args['<test.yml>'] :
		(await promisify(fs.readdir)(path.join(process.cwd(), 'test'), 'utf-8'))
			.filter(f => f.indexOf('public') > -1 && f.endsWith('.yml'))
			.map(f => path.join(process.cwd(), 'test', f));
	return {
		track_yml,
		test_ymls,
	};
}
