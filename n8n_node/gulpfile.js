const gulp = require('gulp');
const ts = require('gulp-typescript');
const path = require('path');

const tsProject = ts.createProject('tsconfig.json');

function buildTypeScript() {
  const compiled = tsProject.src().pipe(tsProject());
  
  return gulp.parallel(
    () => compiled.dts.pipe(gulp.dest('dist')),
    () => compiled.js.pipe(gulp.dest('dist'))
  )();
}

function copyAssets() {
  return gulp.src('nodes/**/*.{svg,png,json}')
    .pipe(gulp.dest('dist/nodes'));
}

function copyCredentialAssets() {
  return gulp.src('credentials/**/*.{svg,png,json}')
    .pipe(gulp.dest('dist/credentials'));
}

function watch() {
  gulp.watch(['nodes/**/*.ts', 'credentials/**/*.ts'], buildTypeScript);
  gulp.watch(['nodes/**/*.{svg,png,json}'], copyAssets);
  gulp.watch(['credentials/**/*.{svg,png,json}'], copyCredentialAssets);
}

const build = gulp.series(
  buildTypeScript,
  gulp.parallel(copyAssets, copyCredentialAssets)
);

exports.default = build;
exports.build = build;
exports.watch = watch;
exports.dev = gulp.series(build, watch);