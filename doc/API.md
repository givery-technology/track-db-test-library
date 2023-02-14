
### `Connection` module

Handles SQLite connection.

#### `Connection#knex`

Raw knex connection object.

#### async `Connection#query(sql, opt_args)`

Queries a single SQL.

```javascript
const employees = await conn.query("SELECT * AS count FROM emp");
employees.forEach(({empno, deptno, name}) => console.log(name));
```

#### async `Connection#queryPlan(sql, opt_args)`

Queries execution plan for a single SQL.

```javascript
// equivalent to:
//   const plansForSelectEmployees = await conn.query("EXPLAIN QUERY PLAN SELECT * AS count FROM emp");
const plansForSelectEmployees = await conn.queryPlan("SELECT * AS count FROM emp");
```

#### async `Connection#queryFromFile(path, opt_args)`

Queries SQLs from file.

```javascript
const {sql, records} = await conn.queryFromFile("emp.sql")[0];
console.log(sql); // SELECT * AS count FROM emp
records.forEach(({empno, deptno, name}) => console.log(name));
```

Note that return value is an array of `{sql: string, records: array}`. 
The given file may contain multiple queries. 

#### async `Connection#queryPlanFromFile(path, opt_args)`

Queries SQLs from file.

```javascript
const {sql, records} = await conn.queryPlanFromFile("emp.sql")[0];
console.log(sql); // EXPLAIN QUERY PLAN SELECT * AS count FROM emp
```

#### async `Connection#loadFromCSV(path, table)`

Loads records from CSV and inserts them into the given table

#### async `Connection#tableSchema(table)`

Queries the table schema.

```javascript
const columns = await conn.tableSchema("my_table");
columns.forEach(({order, name, type}) => console.log(name));
```

### `records` module

Utility for query result records

#### `records.normailze(xs)`

Normalizes each record of `xs` as follows:

* Every keys are changed to lower case.
* Every values are changed their type to `string`s, `boolean`s, or `null`.
    + `String` (object) -> `string` (primitive type)
    + `number` -> `string`
    + ...
* Record itself is converted to `object`
    + `Map` -> `object`
* `xs` is converted to `array`
    + `Set`, Iterators -> `array`

```javascript
const input = [
    {id: 1, NAME: 'NAME #1'},
	{id: 'A', name: 'name #2'},
];
const normalized = records.normalize(input);
// [ 
//  {id: '1', name: 'NAME #1'},
//  {id: 'A', name: 'name #2'},
// ]
```

#### `records.diff(as, bs)`

Diffs two records. Records will be normalized with `records.normailze()`
Result have a two `Map`s for `as` and `bs`, which represents a lineno - columns pair.

```javascript
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
// {
//   a: new Map([
//     [1, ['name', 'flag']] // `name` and `flag` values ('name #2', false) on line 1 are present only in `as`
//   ]),
//   b: new Map([
//     [1, ['name', 'flag']] // `name` and `flag` values ('name #0', true)  on line 1 are present only in `bs`
//   ]),
// }
```

#### `records.format(xs, [option])`

Format records `xs` as a table.

```javascript
console.log(
  records.format(
      [{ empno: 1, deptno: 10, name: "Scott" }]
  )
);
```

```
----------  ----------  ----------
empno       deptno      name      
----------  ----------  ----------
1           10          Scott     
----------  ----------  ----------
```

```javascript
console.log(
  records.format(
      'Employee tables',
      'SELECT * FROM emp',
      [{ empno: 1, deptno: 10, name: "Scott" }]
  )
);
```

```
Employee tables
SELECT * FROM emp
1 row(s) selected
----------  ----------  ----------
empno       deptno      name      
----------  ----------  ----------
1           10          Scott     
----------  ----------  ----------
```

### `i18n` module

Supports internationalization.

#### `i18n.text`

Returns the translation for the given `string`.
It supports for tagged template string style.

`locale/en.yml`
```yaml
"[基本実装] SELECT 文で適切なレコードを取得できる": "[Basic Case] Appropriate records can be fetched by SELECT statements"
```

```javascript
const _ = require('track-db-test-library').i18n.text;

// [Basic Case] Appropriate records can be fetched by SELECT statements
console.log(_('[基本実装] SELECT 文で適切なレコードを取得できる'));
console.log(_`[基本実装] SELECT 文で適切なレコードを取得できる`);
```

### `assertions` module

Introduces a new assertion to `chai.expect`.

To enable the assertions, use `chai.use` as follows:

```javascript
const chai = require('chai');
const dblib = require('track-db-test-library');
chai.use(dblib.assertions);
```

#### `recordEqual(expected, opt_message)`

Deep and fuzzy `equal` which ignores case of keys and ignores `string` / `number` type of values.

```javascript
expect([
  { EMPNO: "1", DEPTNO: "10", NAME: "Scott" }
]).to.recordEqual([
  { empno: 1, deptno: 10, name: "Scott" }
]);
``` 

#### `recordEqualToCsv(path, opt_message)`

Target will be loaded from CSV file.


```javascript
expect([
  { EMPNO: "1", DEPTNO: "10", NAME: "Scott" }
]).to.recordEqualToCsv("emp.csv");
``` 

```csv
empno,deptno,name
1,10,Scott
```

#### `recordContain(value)`

Asserts if the records contain the given value.

```javascript
expect([
  { name: "John",  age: 24, sex: "male" },
  { name: "Karen", age: 21, sex: "female" },
]).to.recordContain(
  { name: "John",  age: 24, sex: "male" },
);
```

`recordContain` supports function matching.

```javascript
expect([
  { name: "John",  age: 24, sex: "male" },
  { name: "Karen", age: 21, sex: "female" },
]).to.recordContain(r => r.age === 24);
```

#### `columns(xs)`

Retains given column(s) from actual records (no assertion)

```javascript
expect([
  { empno: 1, deptno: 10, name: "Scott" }
])
.columns(['deptno', 'name'])
.to.recordEqual([
  { deptno: 10, name: "Scott" }
]);
``` 

#### `without(xs)`

Removes given column(s) from actual records (no assertion)

```javascript
expect([
  { empno: 1, deptno: 10, name: "Scott" }
])
.without('empno') // `.without(['empno'])` will also be accepted
.to.recordEqual([
  { deptno: 10, name: "Scott" }
]);
``` 

#### `orderBy(xs)`

Sort actual records by given columns.
Records will be normalized.

```javascript
expect([
  ...
])
.orderBy(['id', '-name']) // order by `id` (asc) and then `name` (desc)
.to.recordEqual([
  ...
]);
``` 

#### `fullscan()`

Checks if table full scan is planned to `Connection#queryPlan()` results.

```javascript
expect([
    {id:  4, parent: 0, notused: 0, detail: 'SCAN TABLE rooms'},
    {id: 10, parent: 0, notused: 0, detail: 'SEARCH TABLE hotels USING INTEGER PRIMARY KEY (rowid=?)'},
    {id: 28, parent: 0, notused: 0, detail: 'USE TEMP B-TREE FOR ORDER BY'}
]).to.fullscan(['tables', 'rooms']) // by default, checks if 'any' from given tables will be fully scanned
```
