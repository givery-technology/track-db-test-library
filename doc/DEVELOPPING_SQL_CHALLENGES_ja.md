# SQL チャレンジの作成方法

## 事前準備

作業を行う端末で、以下の 2 つのツールをインストールします。

* `track-test-utility`
* `track-db-test-library`

```sh
$ npm install -g track-test-utiility track-db-test-library
```

`track-db-test-library` からは、以下の 2 つのコマンドが利用できるようになります。

* `run-sql`: テンプレート化前の旧チャレンジで使われます。下位互換性のために残しています。コンテンツ作成端末からは削除して構いません。
* `track-db`: CLI ツール

## テンプレートの作成

`track-test-utility` を使います

```sh
$ track-test generate <ディレクトリ> sql
```

`track-test-utility` に収録されているサンプルは、オープンソースのサンプルデータベース [Sakila](https://dev.mysql.com/doc/sakila/en/) が使われています。このデータベースは動作確認用なので、チャレンジ作成時には新しいデータベースを作成してください。

## テストケースの作成

* 公開テストケース: `test/test.public.yml`
* 非公開テストケース: `test/test.public.yml`

にそれぞれ記述します。

例:
```yaml
preparations:
  init_db: &init_db
    - init/create_db.sql
    - init/hotels.csv:hotels
    - init/rooms.csv:rooms
    - sql/answer.sql
testcases:
  - title:
      ja: "[制限事項] 生成されるインデックスは4つ以内で、5カラム以内である"
      en: "[Limitations] No more than 4 indexes are created and no more than 5 columns are indexed"
    exec: *init_db
    check:
      index:
        total:
          ge: 1
          le: 4
        column:
          ge: 1
          le: 5
    debug: false
  - title:
      ja: "[デグレ] hotels テーブルを破壊していない"
      en: "[Regression] `hotels` table has not been broken"
    precheck:
      not_empty: sql/answer.sql
    exec:
      - *init_db
      - SELECT * FROM hotels WHERE id <= 100 ORDER BY id
    check:
      equal_to: init/hotels.csv
  - title:
      ja: "[パフォーマンス] slowquery.sql のフルスキャンが発生しない"
      en: "[Performance] No table full scan for `slowquery.sql`"
    exec:
      - *init_db
      - survey/slowquery.sql
    check:
      no_fullscan: true
```

### `preparations` (任意)

初期化などの SQL テンプレートを登録するセクションです。

`<テンプレート名>: &<テンプレート名>` の形式で項目を登録し、SQL ファイル、CSV ファイル、生 SQL を配列で記述します。

例：
```yaml
preparations:
  init_db: &init_db
    - init/create_db.sql      # SQL ファイルを指定
    - init/hotels.csv:hotels  # CSV は INSERT 文に。<ファイル名>:<テーブル> 形式
    - INSERT INTO hotels ...  # 生の SQL も指定可能
```

### `settings` (任意)

デフォルト設定を行うセクションです。

#### `max_display_rows`

デフォルト値: 10

後述の `equal_to` でテスト結果の比較を行う際、省略されずに表示される最大行数を指定します。
数値、もしくは `unlimited` (省略しない) を指定します。

> `unlimited` はテスト実行を非常に遅くする原因となりますので、慎重に設定してください。

### `testcases` (必須)

テストケースを列挙します。基本骨格は以下の通りです。

```yaml
testcases:
  - title:
      ja: <日本語のテストケース名>
      en: <英語のテストケース名>
    exec:
      <実行する SQL・CSV リスト>
    check:
      <チェック項目>
```

テストケースには、チェック項目 (`check`) の内容によっておおきく **通常テストケース** と **特殊テストケース** の2つに大別されます。

#### `title` (必須)

日本語、英語を併記します。

```yaml
title:
  ja: <日本語のテストケース名>
  en: <英語のテストケース名>
```

英訳を行っていないチャレンジでは、`en` を空にしてしまうと、英語モードで実行した場合にテストケース名が表示されなくなってしまいます。その場合は、`title` 直下に直接テストケース名を指定します。

NG 例:
```yaml
title:
  ja: "[制限事項] 生成されるインデックスは4つ以内である"
  en:
```

OK 例:

```yaml
title: "[制限事項] 生成されるインデックスは4つ以内である"
```

#### `precheck` (任意)

テスト実行前に静的なチェックを行います。
データベースの初期化などは行われていないので注意してください。

* `not_empty` (任意)

  与えられた SQL ファイルに、なんらかの SQL 文が含まれていることを確認します。
  コメントなどを除いて SQL ファイルに中身がない場合はテストが失敗します。

  ```yaml
  precheck:
    not_empty:
      - sql/step1.sql
      - sql/step2.sql
  ```

* `one_command` (任意)

  与えられた SQL ファイルに、なんらかの SQL 文が含まれており、かつ、単一文であることを確認します。
  `not_empty` と共存できますが、意味はありません。

  ```yaml
  precheck:
    one_command:
      - sql/step1.sql
      - sql/step2.sql
  ```

* `ecma` (任意; 非推奨)

  どうしても JavaScript を実行したい場合に指定します。関数 (`async` 関数を含む) の場合、第一引数には `Connection` が渡されます。
  テストケースが作れない場合をのぞいて多用は避けてください。

  ```yaml
  precheck:
    ecma: |-
      async conn => {
        expect(2).to.be.equal(2);
        await conn.query('CREATE TABLE ...');
      }
  ```

#### `exec`

テスト時に実行する SQL や取り込む CSV を指定します。指定順に実行されます。
通常テストケースでは、指定した SQL・CSV のうち、最後に指定されたものが

* **SQL ファイル・生 SQL の場合**: 最後の SQL の実行結果
* **CSV ファイルの場合**: 取り込まれた全レコード

がそれぞれ評価対象になります。

それぞれのテストケースごとにデータベースは完全に破棄されるため、
データの初期化も `exec` で行うようにします。`&` と `*` を使ってテンプレート化すると良いでしょう。

例:
```yaml
testcases:
  - title: ...
    exec:
      - *init_db
      - DELETE FROM emp WHERE empno = 1
      - sql/step1.sql
```

#### `table`

`exec` の特殊系で、テーブル定義を読み込みます。

テーブル定義は以下のレコードとして取得されます。
後述の `check` で評価できます。ただし、SQL に対する評価 (フルスキャン等) はできません。

| 名前 | 説明 |
|------------|--------------|
| `order`    | カラムの定義順 (1 始まり) |
| `name`     | カラム名 |
| `raw_type` | カラム型 (RDBMS による) |
| `fks`      | 外部キー: `Array<{ table: string, column: string}>` |

※ 複数カラムの外部キーに対する挙動は未定義です

例:
```yaml
testcases:
  - title: ...
    exec:
      - CREATE TABLE my_table (a INT, b TEXT)
    table: my_table
    check:
      column: [name]
      equal_to:
        - name: a
        - name: b
```

#### `check` (通常テストケース)

`exec` での最後の SQL・CSV の実行結果に対して評価を行います。

* `message`

  エラーメッセージを規定値以外のものに差替えます

* [評価] `equal_to`

  指定した CSV ファイル、もしくはオブジェクトと実行結果が一致することを確認します。

  ```yaml
  testcases:
    - title: ...
      exec:
        - ...
        - sql/step1.sql
      check:
        equal_to: test/out/public/step1.csv
  ```
* [評価] `len`

  レコードの件数に対して評価を行います。数字を指定した場合、件数が指定数と一致するかを検証します。

  ```yaml
  testcases:
    - title: ...
      exec:
        - ...
        - sql/step1.sql
      check:
        len: 5
  ```

  * `least`: 件数が指定数以上であることを検証します。

    ```yaml
    testcases:
      - title: ...
        exec:
          - ...
          - sql/step1.sql
        check:
          len:
            least: 1
    ```

  * `most`: 件数が指定数以下であることを検証します。

    ```yaml
    testcases:
      - title: ...
        exec:
          - ...
          - sql/step1.sql
        check:
          len:
            most: 10
    ```

  * `not` と組み合わせることも可能です。その場合、`not.len` のように定義します。

    ```yaml
    testcases:
      - title: ...
        exec:
          - ...
          - sql/step1.sql
        check:
          not:
            len: 0 # Non empty check
    ```

* [評価] `contain`

  指定したオブジェクトを含んでいることを確認します。

  ```yaml
  testcases:
    - title: ...
      exec:
        - ...
        - sql/step1.sql
      check:
        contain:
          name: John
          age: 24
          sex: male
  ```

  オブジェクトを複数指定した場合、サブセットである (指定したすべての要素をレコードが含む) ことを確認します。

  ```yaml
  testcases:
    - title: ...
      exec:
        - ...
        - sql/step1.sql
      check:
        contain:
          - name: John
            age: 24
            sex: male
          - name: Karen
            age: 21
            sex: female
  ```

  文字列を指定した場合、JavaScript の関数 (Predicate) であるとして、レコードが関数で「正」と判定されるレコードが存在することを確認します。

  ```yaml
  testcases:
  - title: ...
    exec:
      - ...
      - sql/step1.sql
    check:
      contain: record => record.age > 30
  ```

  > 関数判定の場合、テスト失敗時のメッセージに「期待値」は表示されなくなります。
  > 事前に評価対象カラムをソート (`order_by`、後述) するなどの工夫をすると良いでしょう。

* [評価] `not`

  「評価」の判定条件を反転します。

  ```yaml
  testcases:
    - title: ...
      exec:
        - ...
        - sql/step1.sql
      check:
        not:
          contain:
            name: John
            age: 24
            sex: male
  ```

* [前処理] `columns`

  指定されると、評価対象カラムを `columns` だけに絞ります。

  ```yaml
  testcases:
    - title: ...
      exec:
        - ...
      check:
        columns:
          - id
          - name
  ```

* [前処理] `without`

  指定されると、評価対象カラムから `without` を除きます。

  ```yaml
  testcases:
    - title: ...
      exec:
        - ...
      check:
        without:
          - id
          - name
  ```

* [前処理] `order_by`

  指定されると、`equal_to` の評価前に実行結果を昇順ソートします。
  「SQL を `step1.sql` に記述せよ。ソート順は問わない」みたいなテストケースで使います。

  ```yaml
  testcases:
    - title: ...
      exec:
        - ...
        - sql/step1.sql
      check:
        order_by: id
        equal_to: test/out/public/step1.csv
  ```

  複数カラムでソートしたり、昇順・降順を操作したい場合は以下のようにします。

  ```yaml
  order_by: # equivalent to `ORDER BY column1 [ASC], column2 ASC, column3 DESC`
    - column1
    - +column2
    - -column3
  ```

* [前処理] `column_list`

  `true` を指定すると、カラムリストのみを評価対象とします。対象となるデータには 1 レコード以上のデータを含む必要があります。

  | 名前 | 説明 |
  |------------|--------------|
  | `order`    | カラムの定義順 (1 始まり) |
  | `name`     | カラム名 |

  ```yaml
  testcases:
    - title: ...
      exec:
        - SELECT id, name FROM my_table
      check:
        column_list: true
        equal_to:
          - order: 1
            name: id
          - order: 2
            name: name
  ```

#### `check` (特殊テストケース)

`check` に以下の項目を設定すると、特殊な評価モードに移行します。

* `no_fullscan: true`

  最後に実行された SQL の実行計画を取得します。

  * 注意: `exec` の最後に CSV ファイルを指定しないでください！

* `index`

  特定テーブル、もしくは全テーブルに関するインデックスやインデックスされたカラム数をチェックします。

  * `table` (任意)

    指定すると、そのテーブルに関するインデックスのみにチェック対象を絞ります。
    未指定の場合、全テーブルのインデックスを対象とします。

  * `total`

    特定テーブル、もしくは全テーブルに関するインデックス数の範囲をチェックします。
    `ge` (指定数より多い)、`gt` (指定数以上)、`le` (指定数より少ない)、`lt` (指定数以下) を組み合わせます。

  * `column`

    特定テーブル、もしくは全テーブルに関するインデックスで対象となったカラム数の範囲をチェックします。
    `ge` (指定数より多い)、`gt` (指定数以上)、`le` (指定数より少ない)、`lt` (指定数以下) を組み合わせます。

* `auto_increment`

  特定のカラムが自動採番になっているかどうかをテストします。

  ※ SQLite の場合、対象テーブルに必ず 1 件以上のレコードが存在する状態にしてください。そうでないと正しく動作しません。

  ```yaml
  testcases:
    - title: ...
      exec:
        - ...
      check:
        auto_increment:
          table: my_table
          column: id
          data:
            - name: John
              age: 24
              sex: male
            - name: Karen
              age: 21
              sex: female
  ```

  `data` には実際に登録するデータを記載します。オブジェクト形式で記載した場合、内部的には `INSERT INTO` + `RETURNING` が 1 回だけ発行されるので、多くの場合に効率よくチェックできます。

  受験者が書いた SQL (`INSERT` 文) で自動採番が使われているかどうかを検証することも可能です。
  この場合、対象となる SQL ファイルをしていますが、同時に `precheck` / `one_command` の事前検証を強く推奨します。

  ```yaml
  testcases:
    - title:
      exec:
        - ...
      precheck:
        one_command: src/main.sql
      check:
        auto_increment:
          table: my_table
          column: id
          data:
            - src/main.sql
  ```

  `expected` を指定すると、受験者が書いた SQL (で追加された最後のレコード) の評価ができます。
  自動採番対象以外のカラムが評価対象となります。

  ```yaml
  testcases:
    - title:
      exec:
        - ...
      precheck:
        one_command: src/main.sql
      check:
        auto_increment:
          table: my_table
          column: id
          data:
            - src/main.sql
          expected:
            name: John
            age: 21
            sex: female
  ```

* `last_sql`

  最期に実行された SQL そのものをテストします。

  * `match` に正規表現を指定した場合、正規表現にマッチすることをテストします

    ```yaml
    testcases:
      - title: ...
        exec:
          - ...
        check:
          last_sql:
            match: /^SELECT\s/i
            message:
              ja: SELECT 文以外の SQL が発行されています
              en: SQL other than the SELECT statement has been executed
    ```

  * `match` に関数を指定した場合、関数に受理されることをテストします

    ```yaml
    testcases:
      - title: ...
        exec:
          - ...
        check:
          last_sql:
            match: sql => /^SELECT\s/i.test(sql)
            message:
              ja: SELECT 文以外の SQL が発行されています
              en: SQL other than the SELECT statement has been executed
    ```

  * `match` には複数条件を指定することもできます。その場合、条件に全て合致した場合にのみテストが成功します。

    ```yaml
    testcases:
      - title: ...
        exec:
          - ...
        check:
          last_sql:
            match:
              - /^UPDATE\s/i
              - /\sRETURNING\s+\*$/i
            message:
              ja: UPDATE 文以外の SQL が発行されています
              en: SQL other than the UPDATE statement has been executed
    ```

  * `message` には、エラーメッセージを指定できます (省略可)

    ```yaml
    message: message に直接指定すると、言語の切り替えには対応しません
    ```

    ```yaml
    message:
      ja: 言語切り替えに対応する場合、このように記述します
      en: To support language switching, write like this
    ```

* `error`

  指定した SQL がエラーになることをチェックします。

  * `sql`: エラーになるべき SQL を指定します
  * `expected`: 期待するエラーの種類を指定します
    * `check`: CHECK 制約違反
    * `not_null`: NOT NULL 制約違反
    * `unique`: UNIQUE 制約違反
    * `foreign_key`: FOREIGN KEY 制約違反
    * `unknown`: 上記のどれにも該当しないエラー

  * `message` には、エラーメッセージを指定できます (省略可)

  ```yaml
  testcases:
    - title: ...
      exec:
        - ...
      check:
        error:
          sql: INSERT INTO ...
          expected: not_null
  ```

* `performance`

  指定した SQL の実行が指定時間内に収まることをチェックします。

  * `sql`: 計測対象となる SQL を指定します。
  * `threshold`: 計測対象の上限時間 (ms) を指定します (省略可)。デフォルトは 200 です
  * `message` には、エラーメッセージを指定できます (省略可)

* `ecma`

  どうしても JavaScript を実行したい場合に指定します。関数 (`async` 関数を含む) の場合、第一引数には `Connection` が渡されます。
  テストケースが作れない場合をのぞいて多用は避けてください。

  * 例: 「自動採番」のチェック

    ```yaml
    testcase:
      title: [更新系クエリ] Step1 宿泊施設IDが自動採番されている
      exec: *init_db
      check:
        ecma: |-
          async conn => {
            const randomId = Math.floor(Math.random() * Math.floor(900000)) + 100000;
            await conn.query("UPDATE sqlite_sequence SET seq = ? WHERE name = 'hotels'", [randomId]);
            await conn.queryFromFile("sql/step1.sql");
            const inserted = await tx.query("SELECT * FROM hotels WHERE id = last_insert_rowid()");
            expect(inserted).to.lengthOf(1, _`追加されたデータが見つかりません`);
            expect(inserted).columns('id').to.recordEqual([{id: randomId + 1}], _`自動採番値 (ランダム) が使われていません`);
          }
    ```

### `foreach` / `template`

テンプレートを利用して繰り返しのテストケースが作れます。テンプレート中の文字列のうち、`{{` ～ `}}` (でかつ `foreach` 中に定義されているもの) は、`foreach` の各項目の内容に置き換わります。

```yaml
testcases:
  - foreach:
      - table: my_table
        column: my_column
      - table: another_table
        column: another_column
    template:
      title: "{{table}} テーブルには {{column}} カラムが存在する"
      ...
```

テンプレートで置き換える対象のキーが 1 つしかない場合は、`foreach` には値の配列を直接指定できます。この場合のキーは `item` となります。

```yaml
testcases:
  - foreach:
      - my_column
      - another_column
    template:
      title: "my_table テーブルには {{column}} カラムが存在する"
```

一部のデータにデフォルト値を設定したい場合は、`default` で設定できます

```yaml
testcases:
  - foreach:
      - column: my_column
      - table: another_table
    default:
      table: my_table
      column: another_column
    template:
      title: "{{table}} テーブルには {{column}} カラムが存在する"
      ...
```

また、テンプレート側の文字列が `{{{data}}}` に一致する時、その文字列をキー `data` に対応する値に置き換えます。オブジェクト等をテンプレートに設定するのに有効です。

```yaml
testcases:
  - foreach:
      - table: my_table
        data:
          - column1: value1
            column2: value2
    template:
      title: "{{table}} テーブルの id カラムは自動採番される"
      ...
      check:
        auto_increment:
          table: "{{my_table}}"
          column: id
          data: "{{{data}}}"
```

### `debug: false` (任意)

`false` を指定すると、そのテストケースはデバッグ実行 (後述) の対象外となります。

## track.yml への反映

`test/test.public.yml`、`test/test.public.yml` のテストケースの内容をもとに、

* テストケース数
* デバッグ実行

を反映させます。`track.yml` のあるディレクトリで以下のコマンドを実行します。

```sh
$ track-db migrate-track-yml
```

## データベースのダンプ (init ファイル群の作成)

`db.sqlite` でデータベースの作成作業を行った場合、データベースのファイル群 (`CREATE TABLE`, CSV ファイル) をダンプできます。

`db.sqlite` ファイルがあるディレクトリで以下のコマンドを実行します。

```sh
$ track-db dump
```

標準では `init` ディレクトリに `create_db.sql` と、`<テーブル名>.csv` が作成されます。

## データベースのダンプ (模範解答の実行結果 CSV の作成)

例えば以下のようにすることで、"Expected" の CSV を作成できます。

```sh
$ echo 'sql/step1.sql' | track-db debug --csv > test/data/public/step1.csv
```

ちなみに、`echo` は `cat` でも結果は同じになります。

### データベースの編集

`db.sqlite` の編集は、適切なクライアントを使うことが推奨されますが、`track-db` コマンドでもある程度の編集は可能です。

```sh
$ echo "INSERT INTO hotel (name) VALUES ('温泉旅館○×')" | track-db debug
$ echo hotels.csv | track-db debug # CSV ファイルを渡す場合は、cat ではく、echo を使う
```
