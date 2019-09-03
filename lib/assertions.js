module.exports = function(chai, util) {
	const Assertion = chai.Assertion;
	const flag = util.flag;

	function assertRecordEqual(val, msg) {
		if (msg) {
			flag(this, 'message', msg);
		}
		const obj = flag(this, 'object');
		this.assert(
			recordsEqual(obj, val),
			'expected #{this} to equal to #{exp}',
			'expected #{this} to not equal to #{exp}',
			val
		)
	}

	function recordsEqual(a, b) {
		let typeOfA, typeOfB;
		[typeOfA, a] = modifiedTypeOf(a);
		[typeOfB, b] = modifiedTypeOf(b);
		if (typeOfA !== typeOfB) {
			return false;
		}
		switch (typeOfA) {
			case 'undefined':
			case 'null':
				return true;
			case 'string':
				// allow implicit type conversion to make '5' equal to 'new Number(5)'
				return a == b;
			case 'array':
				return arraysEqual(a, b);
			case 'object':
				return objectsEqual(a, b);
			default:
				return a === b;
		}
	}

	function arraysEqual(a, b) {
		if (a.length !== b.length) {
			return false;
		}
		for (let i = 0, len = a.length; i < len; i++) {
			if (!recordsEqual(a[i], b[i])) {
				return false;
			}
		}
		return true;
	}

	function objectsEqual(a, b) {
		a = keysToLower(a);
		b = keysToLower(b);
		if (Reflect.ownKeys(a).length !== Reflect.ownKeys(b).length) {
			return false;
		}
		for (const [key, _] of Object.entries(a)) {
			if(!recordsEqual(a[key], b[key])) {
				return false;
			}
		}
		return true;
	}

	function keysToLower(obj) {
		const ret = {};
		for (const [key, _] of Object.entries(obj)) {
			ret[key.toLowerCase()] = obj[key];
		}
		return ret;
	}

	function typeOf(x) {
		return Object.prototype.toString.call(x).slice(8, -1).toLowerCase();
	}


	function modifiedTypeOf(x) {
		const typeOfX = typeOf(x);
		switch (typeOfX) {
			case 'number':
				return ['string', String(x)];
			case 'map':
				return ['object', mapToObject(x)];
			default:
				return [typeOfX, x];
		}
	}

	function mapToObject(map) {
		const ret = {};
		for (const [k, v] of map.entries()) {
			ret[k] = v;
		}
		return ret;
	}

	Assertion.addMethod('recordEqual', assertRecordEqual);
};
