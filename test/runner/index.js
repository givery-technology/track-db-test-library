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
	glob("**/config.json").forEach((configPath) => {
		const config = JSON.parse(fs.readFileSync(configPath));
		it(!!config.description ? config.description : configPath, async () => {
			const r = await exec("mocha", ["-R", "tap", "test.js"], path.dirname(configPath));
			if (config.success) {
				expect(r.code, r.stdout + "\n\n" + r.stderr).to.equal(0);
			} else {
				expect(r.code, r.stdout + "\n\n" + r.stderr).to.not.equal(0);
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