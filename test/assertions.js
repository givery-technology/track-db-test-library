const { use, expect } = require('chai');
use(require('../lib/assertions'));

describe('assertions module', () => {
	describe('recordEqual()', () => {
		it('example in README.md', () => {
			expect([
				{EMPNO: "1", DEPTNO: "10", NAME: "Scott"}
			]).to.recordEqual([
				{empno: 1, deptno: 10, name: "Scott"}
			]);
		});
	});

	describe('recordContain()', () => {
		it('value contains', () => {
			expect([
				{ name: "John",  age: 24, sex: "male" },
				{ name: "Karen", age: 21, sex: "female" },
			]).to.recordContain(
				{ name: "John",  age: 24, sex: "male" },
			)
		});

		it('value not contains', () => {
			expect([
				{ name: "John",  age: 24, sex: "male" },
				{ name: "Karen", age: 21, sex: "female" },
			]).not.to.recordContain(
				{ name: "David",  age: 30, sex: "male" },
			)
		});

		it('function contains', () => {
			expect([
				{ name: "John",  age: 24, sex: "male" },
				{ name: "Karen", age: 21, sex: "female" },
			]).to.recordContain(r => r.age === 24);
		});

		it('function not contains', () => {
			expect([
				{ name: "John",  age: 24, sex: "male" },
				{ name: "Karen", age: 21, sex: "female" },
			]).not.to.recordContain(r => r.age === 30);
		});
	});

	describe('fullscan()', () => {
		it('example in README.md', () => {
			expect([
				{id: 4, parent: 0, notused: 0, detail: 'SCAN TABLE rooms'},
				{id: 10, parent: 0, notused: 0, detail: 'SEARCH TABLE hotels USING INTEGER PRIMARY KEY (rowid=?)'},
				{id: 28, parent: 0, notused: 0, detail: 'USE TEMP B-TREE FOR ORDER BY'}
			]).to.fullscan(['tables', 'rooms']);
		});
	});

	describe('columns()', () => {
		it('should eliminate columns except for given ones in actual records', () => {
			expect([
				{a: 10, b: 20},
				{a: 30, b: 40}
			]).columns([
				'a'
			]).to.recordEqual([
				{a: 10},
				{a: 30}
			])
		});

		it('should eliminate columns except for given ones in expected records', () => {
			expect([
				{a: 10},
				{a: 30}
			]).columns([
				'a'
			]).to.recordEqual([
				{a: 10, b: 20},
				{a: 30, b: 40}
			])
		});

		it('should eliminate columns except for given ones both in expected and actual records', () => {
			expect([
				{a: 10, b:  20, c: 50},
				{a: 30, b:  40, d: 60}
			]).columns([
				'a'
			]).to.recordEqual([
				{a: 10, b: -20, e: 70},
				{a: 30, b: -40, f: 80}
			])
		});
	});

	describe('without()', () => {
		it('should eliminate given columns in actual records', () => {
			expect([
				{a: 10, b: 20},
				{a: 30, b: 40}
			]).without([
				'b'
			]).to.recordEqual([
				{a: 10},
				{a: 30}
			])
		});

		it('should eliminate given columns in expected records', () => {
			expect([
				{a: 10},
				{a: 30}
			]).without([
				'b'
			]).to.recordEqual([
				{a: 10, b: 20},
				{a: 30, b: 40}
			])
		});

		it('should eliminate given columns both in expected and actual records', () => {
			expect([
				{a: 10, b:  20, c: 50},
				{a: 30, b:  40, d: 60}
			]).without([
				'b', 'c', 'd', 'e', 'f'
			]).to.recordEqual([
				{a: 10, b: -20, e: 70},
				{a: 30, b: -40, f: 80}
			])
		});
	});
});
