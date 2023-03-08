const filter = require('gulp-custom-filter');
const gulp = require('gulp');
const mocha = require('gulp-mocha');

gulp.task('test', () =>
	gulp.src('test/**/*.js')
		.pipe(filter(filter.not(filter.glob('runner/**/test.js'))))
		.pipe(mocha())
);

exports.default = gulp.parallel('test');
