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

	describe('fullscan()', () => {
		it('example in README.md', () => {
			expect([
				{id: 4, parent: 0, notused: 0, detail: 'SCAN TABLE rooms'},
				{id: 10, parent: 0, notused: 0, detail: 'SEARCH TABLE hotels USING INTEGER PRIMARY KEY (rowid=?)'},
				{id: 28, parent: 0, notused: 0, detail: 'USE TEMP B-TREE FOR ORDER BY'}
			]).to.fullscan(['tables', 'rooms']);
		});
	});
});
