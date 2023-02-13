# track-db-test-library
Test library for Track database challenges

[![Actions Status](https://github.com/givery-technology/track-db-test-library/workflows/Node%20CI/badge.svg)](https://github.com/givery-technology/track-db-test-library/actions)
[![npm version](https://badge.fury.io/js/track-db-test-library.svg)](https://badge.fury.io/js/track-db-test-library)

## Usage

* [API document](doc/API.md)
* [How to develop SQL challenges (ja)](doc/DEVELOPPING_SQL_CHALLENGES_ja.md)

## License

This software is released under the [MIT License](LICENSE).

## Release Note

### Version 2.5.0

* [Feat] Checks for table schema (API / Runner)
* [Feat] Checks for auto increment (API / Runner)
* [Feat] Prechecks: `column` / `without` (Runner)

### Version 2.4.0

* [Feat] Improve error message in `recordEqual` processing when column names are different.
* [Security] Security updates
  
### Version 2.3.1

* [Bugfix] The `precheck` process in handling whitespace.

### Version 2.3.0

* Bump sqlite3 to 5.0.11

### Version 2.2.0

* [Feat] Add `precheck.one_command` to check if the file contains only one command.

### Version 2.1.0

* [Feat] `settings/max_display_rows` test configuration
* [Feat] `--limit`, `--result=full` options to `track-db.js`
* [Feat] Block comment support
* [Bugfix] diff is not displayed correctly under certain conditions
