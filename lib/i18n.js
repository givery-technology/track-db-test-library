const fs = require('fs');
const YAML = require('yaml');

const lang = process.env.CHALLENGE_LANGUAGE || 'ja';
let langMap = {};
add(require('./i18n-buildin.js')[lang]);
add(`locale/${lang}.yml`);

module.exports = {
	text: tagify(getLangMap),
	add,
	message,
};

function getLangMap(text) {
	const candidate = langMap[text];
	return typeof candidate === 'undefined' ? text : candidate;
}

function tagify(fn) {
	return function(strings, ...values) {
		if (typeOf(strings) === 'string') {
			return fn(strings);
		} else {
			return String.raw(
				{ raw: strings.raw.map(s => fn(s)) },
				values.map(s => fn(s))
			);
		}
	}
}

function loadFromFile(path) {
	try {
		return YAML.parse(fs.readFileSync(path, 'utf8'))
	} catch (_) {
		return {};
	}
}

function add(target) {
	switch (typeOf(target)) {
		case 'string':
			Object.assign(langMap, loadFromFile(target));
			break;
		case 'object':
			Object.assign(langMap, target);
			break;
	}
}

function typeOf(x) {
	return Object.prototype.toString.call(x).slice(8, -1).toLowerCase();
}

function message(msg) {
	if (!!msg) {
		if (typeof msg === 'string') {
			return getLangMap(msg);
		} else {
			const m = msg[lang];
			return !!m ? m : Object.values(msg)[0];
		}
	}
}
