# track-db-test-utility
Test utility for Track database challenges

## Usage

### `db` module

Handles database connection for SQLite.

#### `db.Connection`

A wrapper class to utilize knex.

#### `db.Connection#knex`

Raw knex connection object.

#### async `db.Connection#query(sql, opt_args)`

Queries a single SQL.

```javascript
const employees = await _conn.query("SELECT * AS count FROM emp");
employees.forEach(({empno, deptno, name}) => console.log(name));
```

#### async `db.Connection#queryPlan(sql, opt_args)`

Queries execution plan for a single SQL.

```javascript
// equivalent to:
//   const plansForSelectEmployees = await conn.queryPlan("EXPLAIN QUERY PLAN SELECT * AS count FROM emp");
const plansForSelectEmployees = await _conn.queryPlan("SELECT * AS count FROM emp");
```

#### async `db.Connection#queryFromFile(path, opt_args)`

Queries SQLs from file.

```javascript
const {sql, records} = await _conn.queryFromFile("emp.sql")[0];
console.log(sql); // SELECT * AS count FROM emp
records.forEach(({empno, deptno, name}) => console.log(name));
```

#### async `db.Connection#queryPlansFromFile(path, opt_args)`

Queries SQLs from file.

```
const {sql, records} = await conn.queryFromFile("emp.sql")[0];
console.log(sql); // EXPLAIN QUERY PLAN SELECT * AS count FROM emp
```

#### async `db.Connection#loadFromCSV(path, table)`

Loads records from CSV and inserts them into the given table

#### `db.format.records(records)`

Format `records` as a table.

```javascript
console.log(
  db.format.records(
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

#### `db.format(message, sql, records)`

Format `records` with a message

```javascript
console.log(
  db.format(
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
const _ = require('track-db-test-utility').i18n.text;

// [Basic Case] Appropriate records can be fetched by SELECT statements
console.log(_('[基本実装] SELECT 文で適切なレコードを取得できる'));
console.log(_`[基本実装] SELECT 文で適切なレコードを取得できる`);
```

### `assertions` module

Introduces a new assertion to `chai.expect`.

#### `assertions.recordEqual(expected, opt_message)`

Deep and fuzzy `equal` which ignores case of keys and ignores `string` / `number` type of values.

```javascript
const chai = require('chai');
const util = require('track-db-test-utility');
chai.use(util.assertions);

expect(
  [{ EMPNO: "1", DEPTNO: "10", NAME: "Scott" }]
).to.recordEqual(
  [{ empno: 1, deptno: 10, name: "Scott" }]
);
``` 

## License

This software is released under the [MIT License](LICENSE).
