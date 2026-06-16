const { src, dest, series, watch } = require("gulp");
const { readFileSync } = require("fs");
const autoprefixer = require("gulp-autoprefixer");
const cleanCSS = require("gulp-clean-css");
const del = require("del");
const browserSync = require("browser-sync").create();
const sass = require("gulp-sass")(require("sass"));
const fileInclude = require("gulp-file-include");
const gulpif = require("gulp-if");
const htmlmin = require("gulp-htmlmin");
const rev = require("gulp-rev");
const revRewrite = require("gulp-rev-rewrite");
const revDel = require("gulp-rev-delete-original");
const notify = require("gulp-notify");
const imagemin = require("gulp-imagemin");
const webp = require("gulp-webp");
const esbuild = require("esbuild");

let isProduction = false;

const clean = () => {
	return del(["dist/**/*.*"], { force: true });
};

const stylesBackend = () => {
	return src("./src/scss/style.scss")
		.pipe(sass().on("error", notify.onError()))
		.pipe(
			autoprefixer({
				cascade: false,
			}),
		)
		.pipe(gulpif(isProduction, cleanCSS({ level: 2 })))
		.pipe(dest("./dist/css/"))
		.pipe(browserSync.stream());
};

const cleanHashedAssets = () => {
	return del(["dist/js/app-*.js", "dist/css/style-*.css", "dist/rev.json"], { force: true });
};

const scriptsBundle = async () => {
	try {
		await esbuild.build({
			entryPoints: ["./src/js/main.js"],
			bundle: true,
			minify: isProduction,
			target: ["es2020"],
			outfile: "./dist/js/app.js",
			format: "esm",
			logLevel: "silent",
			legalComments: "none",
			drop: isProduction ? ["console"] : [],
		});
		browserSync.stream();
	} catch (error) {
		notify.onError()(error);
		throw error;
	}
};

const resources = () => {
	return src("./src/resources/**")
		.pipe(dest("./dist"))
		.pipe(browserSync.stream());
};

const images = () => {
	const raster = () =>
		src([
			"./src/img/*.{jpg,jpeg,png,webp}",
			"./src/img/**/*.{jpg,jpeg,png,webp}",
		])
			.pipe(webp())
			.pipe(imagemin())
			.pipe(dest("./dist/img"));

	const vectors = () =>
		src(["./src/img/**/*.svg"]).pipe(dest("./dist/img"));

	return Promise.all([raster(), vectors()]);
};

const htmlInclude = () => {
	return src(["./src/*.html", "!./src/_*.html", "!./src/templates.html"])
		.pipe(
			fileInclude({
				prefix: "@",
				basepath: "@file",
			}),
		)
		.pipe(
			gulpif(
				isProduction,
				htmlmin({
					collapseWhitespace: true,
					removeComments: true,
					minifyCSS: true,
					minifyJS: true,
				}),
			),
		)
		.pipe(dest("./dist"))
		.pipe(browserSync.stream());
};

const cache = () => {
	return src("dist/**/*.{css,js,svg,png,jpg,jpeg,webp,woff2,woff}", {
		base: "dist",
	})
		.pipe(rev())
		.pipe(revDel())
		.pipe(dest("dist"))
		.pipe(rev.manifest("rev.json"))
		.pipe(dest("dist"));
};

const rewrite = () => {
	const manifest = readFileSync("dist/rev.json");
	src("dist/css/*.css")
		.pipe(
			revRewrite({
				manifest,
			}),
		)
		.pipe(dest("dist/css"));
	return src("dist/**/*.html")
		.pipe(
			revRewrite({
				manifest,
			}),
		)
		.pipe(dest("dist"));
};

const watchFiles = () => {
	browserSync.init({
		server: {
			baseDir: "./dist",
		},
		open: false,
		notify: false,
	});

	watch("./src/scss/**/*.scss", stylesBackend);
	watch("./src/js/**/*.js", scriptsBundle);
	watch("./src/partials/*.html", htmlInclude);
	watch("./src/partials/connected/*.html", htmlInclude);
	watch("./src/partials/sections/*.html", htmlInclude);
	watch("./src/*.html", htmlInclude);
	watch("./src/resources/**", resources);
	watch("./src/img/*.{jpg,jpeg,png,svg,webp}", images);
	watch("./src/img/**/*.{jpg,jpeg,png,svg,webp}", images);
	watch("./src/img/svg/**.svg", images);
};

exports.default = series(
	cleanHashedAssets,
	htmlInclude,
	scriptsBundle,
	stylesBackend,
	resources,
	images,
	watchFiles,
);

exports.cache = series(cache, rewrite);

exports.build = series(
	(done) => {
		isProduction = true;
		done();
	},
	clean,
	htmlInclude,
	stylesBackend,
	scriptsBundle,
	resources,
	images,
	cache,
	rewrite,
);
