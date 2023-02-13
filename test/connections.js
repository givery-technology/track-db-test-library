const { expect } = require('chai');
const knex = require('knex');
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

	describe("Connection class", () => {
		let conn;
		beforeEach(async () => {
			conn = await Connection.new({
				client: 'sqlite3',
				clean: true,
				connection: ':memory:',
			})
		});

		afterEach(() => {
			conn.close();
		});

		describe("tableSchema()", () => {
			it("works", async () => {
				await conn.query(`DROP TABLE IF EXISTS my_table`);
				await conn.query(`
					CREATE TABLE my_table (
						column1 INTEGER PRIMARY KEY AUTOINCREMENT,
						column3 TEXT NOT NULL,
						column2 DATE
					)
				`);

				const actual = await conn.tableSchema('my_table');
				const expected = [
					{ order: 1, name: 'column1', raw_type: 'INTEGER' },
					{ order: 2, name: 'column3', raw_type: 'TEXT' },
					{ order: 3, name: 'column2', raw_type: 'DATE' },
				];
				expect(actual).to.deep.equal(expected);
			});
		});

		describe("updateAutoIncrement()", () => {
			it("works", async () => {
				await conn.query(`DROP TABLE IF EXISTS my_table`);
				await conn.query(`
					CREATE TABLE my_table (
						id INTEGER PRIMARY KEY AUTOINCREMENT,
						name TEXT
					)
				`);
				await conn.query(`INSERT INTO my_table (name) VALUES ('hoge')`);

				await conn.updateAutoIncrement('my_table', 'id', 100);

				const actual = await conn.query(`INSERT INTO my_table (name) VALUES ('fuga') RETURNING *`);
				const expected = [
					{ id: 101, name: 'fuga' },
				];

				expect(actual).to.deep.equal(expected);
			});
		});
	});
});
