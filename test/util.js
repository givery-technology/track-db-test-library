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
			const actual = applyTemplate(props, undefined, template);

			expect(actual).to.deep.equal(expected);
			expect(template).not.to.deep.equal(expected);
		});
		it('should work #2', () => {
			const props = "Value A";
			const template = {
				prop1: {
					name: "{{item}} and Value B"
				},
				prop2: "{{ item }}"
			};
			const expected = {
				prop1: {
					name: "Value A and Value B"
				},
				prop2: "Value A"
			};
			const actual = applyTemplate(props, undefined, template);

			expect(actual).to.deep.equal(expected);
			expect(template).not.to.deep.equal(expected);
		});
	});
});
