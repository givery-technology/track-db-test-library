const fs = require("fs").promises;
const os = require("os");
const expect = require("chai").expect;
const u = require("./util");

describe("MySQL test runner", function () {
	this.timeout(30000);

	let dir
	beforeEach(async () => {
		dir = await fs.mkdtemp(os.tmpdir() + "/");
	});
	afterEach(async () => {
		await fs.rm(dir, { recursive: true });
	});

	it("should work", async () => {
		await u.write(dir, {
			"package.json": u.trimTextBlock(`
				{
					"scripts": {
						"test": "mocha -R track-reporter"
					},
					"dependencies": {
						"track-db-test-library": "${process.cwd()}",
						"mysql": "2.18"
					}
				}
			`),
			"test": {
				"test.js": u.trimTextBlock(`
					const dblib = require("track-db-test-library");
					const runner = new dblib.TestRunner("ja", "test/test.yml");
					runner.runAll();
				`),
				"test.yml": u.trimTextBlock(`
					client: mysql
					testcases:
					  - title: "[Basic] テスト"
					    exec:
					      - CREATE TABLE points(x INTEGER, y INTEGER)
					      - INSERT INTO points (x, y) VALUES (1, 2)
					      - SELECT x, y FROM points
					    check:
					      equal_to: test/01.csv
				`),
				"01.csv": u.trimTextBlock(`
					x,y
					1,2
				`),
			}
		});

		await u.exec("npm install", { cwd: dir });
		const r = await u.exec("npm test", { cwd: dir });

		expect(r.ok).to.be.true;
		expect(r.stdout).to.include("# pass 1");
	});
});
