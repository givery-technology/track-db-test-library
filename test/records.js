const expect = require('chai').expect;
const { normalize, diff, format, toCSV } = require('../lib/records');

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

		it('can normalize Date into String (for PostgreSQL)', () => {
			const input = [
				{ date: new Date("2020/07/07 12:23:45") },
				{ date: '2020-07-07 12:23:45' },
			];
			const expected = [
				{ date: '2020-07-07 12:23:45' },
				{ date: '2020-07-07 12:23:45' },
			];
			const actual = normalize(input);
			expect(actual).to.eql(expected);
		});
	});

	describe('diff()', function() {
		this.timeout(2000);

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

		function summerize(diff) {
			const result = { a: {}, b: {} };
			for (xs of diff.a.values()) {
				xs.forEach(x => {
					result.a[x] = (result.a[x] || 0) + 1;
				});
			}
			for (xs of diff.b.values()) {
				xs.forEach(x => {
					result.b[x] = (result.b[x] || 0) + 1;
				});
			}
			return result;
		}

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
			expect(summerize(actual)).to.eql(summerize(expected));
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
			expect(summerize(actual)).to.eql(summerize(expected));
		});

		it('bench', () => {
			const as = [];
			const bs = [];
			const rep = 1000;
			for (let i = 0; i < rep; i++) {
				as.push({
					col1: i,
					col2: i,
					col3: `name-$i`,
					col4: i,
					col5: i,
				});
				bs.push({
					col1: i,
					col2: i,
					col4: i,
					col5: i,
				});
			}
			const actual = diff(as, bs);
			const expectedSummary = { a: {col3: rep}, b: {col3: rep} };
			expect(summerize(actual)).to.eql(expectedSummary);
		});

		it('diffs for as which lack columns', () => {
			const as = [
				{id: 'a', name: 'name #1'},
				{id: 'b', name: 'name #2'},
				{id: 'c', name: 'name #3'},
			];
			const bs = [
				{id: 'a', flag: true, name: 'name #1'},
				{id: 'b', flag: false, name: 'name #2'},
				{id: 'c', flag: false, name: 'name #3'},
			];
			const expected = {
				a: new Map([ // TODO: fix to make this empty
					[0, ['flag']],
					[1, ['flag']],
					[2, ['flag']],
				]),
				b: new Map([
					[0, ['flag']],
					[1, ['flag']],
					[2, ['flag']],
				]),
			};
			const actual = diff(as, bs);
			const expectedSummary = { a: {flag: 2}, b: {flag: 3} };
			expect(summerize(actual)).to.eql(expectedSummary);
		});

		it('diffs for bs which lack columns', () => {
			const as = [
				{id: 'a', flag: true, name: 'name #1'},
				{id: 'b', flag: false, name: 'name #2'},
				{id: 'c', flag: false, name: 'name #3'},
			];
			const bs = [
				{id: 'a', name: 'name #1'},
				{id: 'b', name: 'name #2'},
				{id: 'c', name: 'name #3'},
			];
			const expected = {
				a: new Map([
					[0, ['flag']],
					[1, ['flag']],
					[2, ['flag']],
				]),
				b: new Map([ // TODO: fix to make this empty
					[0, ['flag']],
					[1, ['flag']],
					[2, ['flag']],
				]),
			};
			const actual = diff(as, bs);
			const expectedSummary = { a: {flag: 3}, b: {flag: 3} };
			expect(summerize(actual)).to.eql(expectedSummary);
		});
	});

	describe('format()', () => {
		it('can format records with Date types', () => {
			const input = [
				{ date: new Date("2020/07/07 12:23:45") },
				{ date: '2020-07-07 12:23:45' },
			];
			const actual = format(input);
			const expected = [
				'-------------------',
				'date               ',
				'-------------------',
				'2020-07-07 12:23:45',
				'2020-07-07 12:23:45',
				'-------------------',
				'',
			].join('\n');
			expect(actual).to.eql(expected);
		});
	});

	describe('toCSV()', () => {
		it('can format records with Date types', () => {
			const input = [
				{ date: new Date("2020/07/07 12:23:45") },
				{ date: '2020-07-07 12:23:45' },
			];
			const actual = toCSV(input);
			const expected = [
				'date',
				'2020-07-07 12:23:45',
				'2020-07-07 12:23:45',
			].join('\n');
			expect(actual).to.eql(expected);
		});
	});
});
