function applyTemplate(props, defaults, template) {
	if (typeof props === "string") {
		props = { item: props };
	} else {
		props = Object.assign(defaults || {}, props);
	}
	return doApplyTemplate(props, template);
}

function doApplyTemplate(props, obj) {
	if (typeof obj === "string") {
		for (let [key, value] of Object.entries(props)) {
			obj = obj.replaceAll(new RegExp(`{{\\s*${key}\\s*}}`, "g"), value);
		}
		return obj;
	} else if (Array.isArray(obj)) {
		return obj.map(elem => doApplyTemplate(props, elem));
	} else if (typeof obj === "object") {
		let result = {};
		for (let p in obj) {
			if (!obj.hasOwnProperty(p)) {
				continue;
			}
			result[p] = doApplyTemplate(props, obj[p]);
		}
		return result
	} else {
		return obj;
	}
}

module.exports = {
	applyTemplate
};
