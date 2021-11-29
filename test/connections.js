const { expect } = require('chai');
const Connection = require('../lib/connection');

describe('connections module', () => {
	describe('parseSQL()', () => {
		const parseSQL = Connection.util.parseSQL;

		it('should split a sql with ","', () => {
			const input = `
				SELECT * FROM departments;
				SELECT * FROM employees;
			`;
			const expected = [
				'SELECT * FROM departments',
				'SELECT * FROM employees',
			];
			const actual = parseSQL(input);
			expect(actual).to.deep.equal(expected);
		});

		it('should treat with line comments', () => {
			const input = `
				SELECT * FROM departments; -- comment 1
				-- comment 2
				SELECT * FROM employees; -- comment 3
				-- comment 4
			`;
			const expected = [
				'SELECT * FROM departments',
				'SELECT * FROM employees',
			];
			const actual = parseSQL(input);
			expect(actual).to.deep.equal(expected);
		});

		it('should treat with line comments that contains ";"', () => {
			const input = `
				SELECT * FROM departments; -- comment 1; comment 2
				-- comment 3; comment 4
				SELECT * FROM employees; -- comment 5; comment 6;
				-- comment 7; comment 8;
			`;
			const expected = [
				'SELECT * FROM departments',
				'SELECT * FROM employees',
			];
			const actual = parseSQL(input);
			expect(actual).to.deep.equal(expected);
		});

		it('should treat with block comments', () => {
			const input = `
				SELECT * FROM departments; /* comment 1
				                              comment 2 */
				SELECT * FROM /* comment 3 */ employees;
			`;
			const expected = [
				'SELECT * FROM departments',
				'SELECT * FROM  employees',
			];
			const actual = parseSQL(input);
			expect(actual).to.deep.equal(expected);
		});
	});
});
