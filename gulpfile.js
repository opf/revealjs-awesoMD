const gulp = require('gulp')
const eslint = require('gulp-eslint')
const prettier = require('gulp-prettier')
const { rollup } = require('rollup')
const terser = require('@rollup/plugin-terser')
const babel = require('@rollup/plugin-babel').default
const commonjs = require('@rollup/plugin-commonjs')
const resolve = require('@rollup/plugin-node-resolve').default
const sourcemaps = require('gulp-sourcemaps')
const sass = require('gulp-sass')(require('sass'))
const minify = require('gulp-clean-css')

const cache = {}

const babelConfig = {
    babelHelpers: 'bundled',
    ignore: ['node_modules'],
    compact: false,
    extensions: ['.js', '.html'],
    plugins: ['transform-html-import-to-string'],
    presets: [
        [
            '@babel/preset-env',
            {
                corejs: 3,
                useBuiltIns: 'usage',
                modules: false,
            },
        ],
    ],
    configFile: false,
}

gulp.task('lint', () =>
    gulp.src(['./**/*.js', '!node_modules/**', '!plugin/awesoMD/awesoMD*.js']).pipe(eslint()).pipe(eslint.format())
)

gulp.task('format', () =>
    gulp.src(['./**/*.js', '!node_modules/**', '!plugin/awesoMD/awesoMD*.js']).pipe(prettier()).pipe(gulp.dest('.'))
)

gulp.task('build-plugins', () => {
    return Promise.all(
        [{ name: 'RevealAwesoMD', input: './plugin/awesoMD/plugin.js', output: './plugin/awesoMD/awesoMD' }].map(
            (plugin) => {
                return rollup({
                    cache: cache[plugin.input],
                    input: plugin.input,
                    plugins: [
                        resolve(),
                        commonjs(),
                        babel({
                            ...babelConfig,
                            ignore: ['node_modules'],
                        }),
                        terser(),
                    ],
                }).then((bundle) => {
                    cache[plugin.input] = bundle.cache
                    bundle.write({
                        file: plugin.output + '.esm.js',
                        name: plugin.name,
                        format: 'es',
                    })

                    bundle.write({
                        file: plugin.output + '.js',
                        name: plugin.name,
                        format: 'umd',
                    })
                })
            }
        )
    )
})

gulp.task('compileToCSS', () => {
    return gulp
        .src(['css/**/*.scss', 'css/**/*.sass'])
        .pipe(sourcemaps.init())
        .pipe(sass().on('error', sass.logError))
        .pipe(minify({ compatibility: 'ie9' }))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('./dist/css'))
})

gulp.task('css', () => gulp.src(['css/**/*.css']).pipe(gulp.dest('./dist/css')))

gulp.task('build', gulp.series('compileToCSS', 'css', 'build-plugins'))
