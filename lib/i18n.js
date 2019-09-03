const fs = require('fs');
const YAML = require('yaml');

const lang = process.env.CHALLENGE_LANGUAGE || 'ja';
let langMap;
try {
	langMap = YAML.parse(fs.readFileSync(`locale/${lang}.yml`, 'utf8'));
} catch (e) {
	langMap = {};
}

module.exports = {
	text: tagify(text => langMap[text] || text)
};

function tagify(fn) {
	return function(strings, ...values) {
		if (typeof strings === 'string' || strings instanceof String) {
			return fn(strings);
		} else {
			return String.raw(
				{ raw: strings.raw.map(s => fn(s)) },
				values.map(s => fn(s))
			);
		}
	}
}
