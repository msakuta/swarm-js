/* jshint strict: false */
/* globals require, console */
var gulp = require('gulp');
var duration = require("gulp-duration");
var exit = require('gulp-exit');

var browserify = require('browserify');
var watchify = require('watchify');
var babelify = require('babelify');

var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');

var rename = require('gulp-rename');
var uglify = require('gulp-uglify');
var sourcemaps = require('gulp-sourcemaps');


function compile(watch, cb) {
    var compiler = browserify('./src/app.js', {debug: true}).transform(babelify);

    function rebundle(compiler, useUglify) {
        let pre = compiler
            .bundle();
        if(watch)
            pre = pre
                .on('error', function (err) {
                    console.error(err);
                    this.emit('end');
                });
        pre = pre
            .pipe(source('build.js'))
            .pipe(duration( 'compiled ' ))
            .pipe(buffer())
            .pipe(rename('index.min.js'))
            .pipe(sourcemaps.init({loadMaps: true}));
        if(useUglify)
            pre = pre.pipe(uglify());
        return pre
            .pipe(sourcemaps.write('./'))
            .pipe(gulp.dest('./build'));
    }

    if (watch) {
        var bundler = watchify(compiler);
        bundler.on('update', function () {
            console.log('-> bundling...');
            rebundle(bundler);
        });

        rebundle(compiler);
    } else {
        return rebundle(compiler, true);
    }
}

function watch() {
    return compile(true, () => {});
}

gulp.task('compile', function (cb) {
    return compile(false, cb);
});
gulp.task('copy-html', function (cb) {
    return gulp.src('./static/index.html').pipe(gulp.dest('./build/'));
});
gulp.task('build', gulp.parallel(['compile', 'copy-html']));
gulp.task('watch', () => compile(true, () => {}));

gulp.watch(['./static/index.html'], gulp.series('copy-html'));

gulp.task('default', gulp.series('watch'));