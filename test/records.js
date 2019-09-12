const expect = require('chai').expect;
const { normalize, diff } = require('../lib/records');

describe('records module', () => {
	describe('normalize()', () => {
		it('keys should be converted to lowercase', () => {
			const input = [
				{ID: 'a', NAME: 'name #1'},
				{id: 'b', name: 'name #2'},
			];
			const expected = [
				{id: 'a', name: 'name #1'},
				{id: 'b', name: 'name #2'},
			];
			const actual = normalize(input);
			expect(actual).to.eql(expected);
		});

		it('string values should keep cases', () => {
			const input = [
				{id: 'a', name: 'NAME #1'},
				{id: 'B', name: 'name #2'},
			];
			const expected = [
				{id: 'a', name: 'NAME #1'},
				{id: 'B', name: 'name #2'},
			];
			const actual = normalize(input);
			expect(actual).to.eql(expected);
		});

		it('number values should be converted to strings', () => {
			const input = [
				{id: 1, name: 'name #1'},
				{id: 2, name: 'name #2'},
			];
			const expected = [
				{id: '1', name: 'name #1'},
				{id: '2', name: 'name #2'},
			];
			const actual = normalize(input);
			expect(actual).to.eql(expected);
		});

		it('mixed testcase', () => {
			const input = [
				{id: 1, NAME: 'NAME #1'},
				{id: 'A', name: 'name #2'},
			];
			const expected = [
				{id: '1', name: 'NAME #1'},
				{id: 'A', name: 'name #2'},
			];
			const actual = normalize(input);
			expect(actual).to.eql(expected);
		});
	});

	describe('diff()', () => {
		it('no diffs for the same records', () => {
			const as = [
				{id: 'a', name: 'name #1', flag: true},
				{id: 'b', name: 'name #2', flag: false},
				{id: 'c', name: 'name #3', flag: false},
			];
			const bs = [
				{id: 'a', name: 'name #1', flag: true},
				{id: 'b', name: 'name #2', flag: false},
				{id: 'c', name: 'name #3', flag: false},
			];
			const expected = {a: new Map(), b: new Map()};
			const actual = diff(as, bs);
			expect(actual).to.eql(expected);
		});

		it('no diffs for just normalizable valiations', () => {
			const as = [
				{id: 1, name: 'name #1', flag: true},
				{id: 2, name: 'name #2', flag: false},
				{id: 3, name: 'name #3', flag: false},
			];
			const bs = [
				{id: '1', name: 'name #1', flag: true},
				{id: 2, NAME: 'name #2', flag: new Boolean(false)},
				{id: '3', name: 'name #3', flag: false},
			];
			const expected = {a: new Map(), b: new Map()};
			const actual = diff(as, bs);
			expect(actual).to.eql(expected);
		});

		it('diffs for one record, some columns', () => {
			const as = [
				{id: 'a', name: 'name #1', flag: true},
				{id: 'b', name: 'name #2', flag: false},
				{id: 'c', name: 'name #3', flag: false},
			];
			const bs = [
				{id: 'a', name: 'name #1', flag: true},
				{id: 'b', name: 'name #0', flag: true},
				{id: 'c', name: 'name #3', flag: false},
			];
			const expected = {
				a: new Map([[1, ['name', 'flag']]]),
				b: new Map([[1, ['name', 'flag']]]),
			};
			const actual = diff(as, bs);
			expect(actual).to.eql(expected);
		});

		it('diffs for as which lack records', () => {
			const as = [
				{id: 'b', name: 'name #2', flag: false},
			];
			const bs = [
				{id: 'a', name: 'name #1', flag: true},
				{id: 'b', name: 'name #2', flag: false},
				{id: 'c', name: 'name #3', flag: false},
			];
			const expected = {
				a: new Map(),
				b: new Map([
					[0, ['id', 'name', 'flag']],
					[2, ['id', 'name', 'flag']],
				]),
			};
			const actual = diff(as, bs);
			expect(actual).to.eql(expected);
		});

		it('diffs for bs which lack records', () => {
			const as = [
				{id: 'a', name: 'name #1', flag: true},
				{id: 'b', name: 'name #2', flag: false},
				{id: 'c', name: 'name #3', flag: false},
			];
			const bs = [
				{id: 'b', name: 'name #2', flag: false},
			];
			const expected = {
				a: new Map([
					[0, ['id', 'name', 'flag']],
					[2, ['id', 'name', 'flag']],
				]),
				b: new Map(),
			};
			const actual = diff(as, bs);
			expect(actual).to.eql(expected);
		});

	});
});
