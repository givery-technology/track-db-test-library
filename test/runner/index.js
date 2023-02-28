const { expect } = require("chai");
const cp = require("child_process");
const fs = require("fs");
const fse = require("fs-extra");
const glob = require("glob").sync;
const { mktempDir } = require("fs-mktemp");
const path = require("path");
const util = require("util");

describe("TestRunner", function() {
	this.slow(1000);
	glob(`**/config.json`).forEach((configPath) => {
		const config = JSON.parse(fs.readFileSync(configPath));
		it(!!config.description ? config.description : configPath, async () => {
			const result = parse(await exec("mocha", ["-R", "tap", "test.js"], path.dirname(configPath)));
			for (let r of result) {
				expect(r.success, `Failed ${r.index} th testcase: ${r.title}`).to.be.true;
			}
		});
	});
});

function exec(command, args, basePath) {
	return new Promise((resolve, _) => {
		const p = cp.spawn(command, args, { cwd: basePath });
		let stdout = "";
		let stderr = "";
		p.stdout.on("data", (data) => stdout += data);
		p.stderr.on("data", (data) => stderr += data);
		p.on("close", (code) => {
			resolve({
				stdout, stderr, code
			});
		});
	});
}

function parse(r) {
	return r.stdout.split('\n')
		.map(line => /^(not\s+)?ok\s+(\d+)\s+\[([^\]]+)\]\s+(\S.*)/.exec(line))
		.filter(m => !!m)
		.map(m => ({
			index: Number(m[2]),
			ok: m[3] === 'ok',
			success: !m[1] ? m[3] === 'ok' : m[3] !== 'ok',
			title: m[4],
		}));
}
