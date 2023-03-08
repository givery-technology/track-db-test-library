const expect = require('chai').expect;
const { applyTemplate } = require('../lib/util');

describe('util module', () => {
	describe('applyTemplate()', () => {
		it('should work #1', () => {
			const props = {
				a: "Value A",
				b: "Value B",
			};
			const template = {
				prop1: {
					name: "{{a}} and {{ b }}"
				},
				prop2: "{{ a }}",
				prop3: [ "{{b}}" ],
				prop4: [{
					name: "{{ a}}"
				}, {
					name: "{{b }}"
				}]
			};
			const expected = {
				prop1: {
					name: "Value A and Value B"
				},
				prop2: "Value A",
				prop3: [ "Value B" ],
				prop4: [{
					name: "Value A"
				}, {
					name: "Value B"
				}]
			};
			const actual = applyTemplate(props, template);

			expect(actual).to.deep.equal(expected);
			expect(template).not.to.deep.equal(expected);
		});
		it('should work with data replacer', () => {
			const props = {
				a: "Value A",
				data: {
					x: 10,
					y: 20,
				},
			};
			const template = {
				a: "== {{a}} ==",
				data: "{{{data}}}",
				non_data: "== {{{data}}} ==",
			};
			const expected = {
				a: "== Value A ==",
				data: {
					x: 10,
					y: 20,
				},
				non_data: "== {{{data}}} ==",
			}
			const actual = applyTemplate(props, template);

			expect(actual).to.deep.equal(expected);
		});
	});
});
