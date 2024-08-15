const fs = require("fs");
const cp = require("child_process");
const util = require("util");

async function write(dir, files) {
	await fs.promises.mkdir(dir, { recursive: true });
	for (const [path, content] of Object.entries(files)) {
		if (typeof content === "string") {
			await fs.promises.writeFile(`${dir}/${path}`, content, "utf-8");
		} else {
			await write(`${dir}/${path}`, content);
		}
	}
}

function trimTextBlock(text) {
	const lines = text.split("\n");
	const firstLine = lines.findIndex(s => s.trim().length > 0);
	const indent = (/^\s*/.exec(lines[firstLine])[0] || { length: 0 }).length;
	return lines.slice(firstLine).map(s => s.substring(indent)).join("\n");
}

async function exec(command, options) {
	try {
		const { stdout, stderr } = await util.promisify(cp.exec)(command, options);
		// stdout && console.log(stdout);
		// stderr && console.error(stderr);
		return {
			ok: true,
			stdout,
			stderr,
		};
	} catch (err) {
		// err.stdout && console.error(err.stdout);
		// err.stderr && console.error(err.stderr);
		return {
			ok: false,
			stdout: err.stdout,
			stderr: err.stderr,
			...err,
		};
	}
}

module.exports = {
	write,
	trimTextBlock,
	exec,
}
