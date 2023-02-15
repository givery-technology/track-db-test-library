const dblib = require("../../..");
const runner = new dblib.TestRunner("ja", `${__dirname}/test.yml`);
runner.runAll();