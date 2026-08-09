const { src, dest, series, watch, parallel } = require("gulp");
const { readFileSync, existsSync } = require("fs");
const { resolve } = require("path");
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

const FIREBASE_ENV_KEYS = [
	"FIREBASE_API_KEY",
	"FIREBASE_AUTH_DOMAIN",
	"FIREBASE_DATABASE_URL",
	"FIREBASE_PROJECT_ID",
	"FIREBASE_STORAGE_BUCKET",
	"FIREBASE_MESSAGING_SENDER_ID",
	"FIREBASE_APP_ID",
];

function loadEnvFile() {
	const envPath = resolve(__dirname, ".env");
	if (!existsSync(envPath)) return;

	for (const line of readFileSync(envPath, "utf8").split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;

		const separator = trimmed.indexOf("=");
		if (separator === -1) continue;

		const key = trimmed.slice(0, separator).trim();
		let value = trimmed.slice(separator + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}

		if (!(key in process.env)) {
			process.env[key] = value;
		}
	}
}

function getFirebaseDefine() {
	loadEnvFile();

	return FIREBASE_ENV_KEYS.reduce((define, key) => {
		define[`__${key}__`] = JSON.stringify(process.env[key] || "");
		return define;
	}, {});
}

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
	return del(
		[
			"dist/js/app-*.js",
			"dist/js/login-gate-*.js",
			"dist/js/chunks/**",
			"dist/css/style-*.css",
			"dist/fonts/*-*.woff",
			"dist/fonts/*-*.woff2",
			"dist/favicon/**",
			"dist/rev.json",
		],
		{ force: true },
	);
};

const SESSION_COOKIE = "hayshed_id";

function isAlwaysPublicDevPath(pathname) {
	if (/^\/js\/login-gate(?:-[a-zA-Z0-9]+)?\.js$/.test(pathname)) return true;
	if (pathname.startsWith("/favicon")) return true;
	if (pathname === "/sw.js") return true;
	if (
		pathname === "/apple-touch-icon.png" ||
		pathname === "/apple-touch-icon-precomposed.png" ||
		pathname === "/apple-touch-icon-180x180.png" ||
		pathname === "/favicon.ico"
	) {
		return true;
	}
	return false;
}

function hasDevSessionCookie(req) {
	const cookieHeader = req.headers.cookie || "";
	const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]*)`));
	return Boolean(match && match[1]);
}

function protectDevAssets(req, res, next) {
	const raw = req.url || "/";
	const qIndex = raw.indexOf("?");
	const pathname = qIndex === -1 ? raw : raw.slice(0, qIndex);
	const query = qIndex === -1 ? "" : raw.slice(qIndex);
	const authed = hasDevSessionCookie(req);

	// Clean URL: with session, / and /index.html serve the app shell
	if (pathname === "/" || pathname === "/index.html") {
		if (authed) {
			req.url = `/app.html${query}`;
		}
		next();
		return;
	}

	// Never leave app.html in the address bar
	if (pathname === "/app.html" || pathname === "/app") {
		res.writeHead(302, { Location: query ? `/${query}` : "/" });
		res.end();
		return;
	}

	if (isAlwaysPublicDevPath(pathname)) {
		next();
		return;
	}

	if (authed) {
		next();
		return;
	}

	const accept = req.headers.accept || "";
	if (accept.includes("text/html") || pathname.endsWith(".html")) {
		res.writeHead(302, { Location: "/" });
		res.end();
		return;
	}

	res.writeHead(401, {
		"Cache-Control": "no-store",
		"Content-Type": "text/plain; charset=utf-8",
	});
	res.end("Unauthorized");
}

const scriptsBundle = async () => {
	try {
		const define = getFirebaseDefine();
		const shared = {
			bundle: true,
			minify: isProduction,
			target: ["es2020"],
			format: "esm",
			logLevel: "silent",
			legalComments: "none",
			drop: isProduction ? ["console"] : [],
			define,
		};

		// Separate login bundle so app code is never shipped in public JS.
		await esbuild.build({
			...shared,
			entryPoints: ["./src/js/login-gate.js"],
			splitting: false,
			outfile: "./dist/js/login-gate.js",
		});

		await esbuild.build({
			...shared,
			entryPoints: ["./src/js/main.js"],
			splitting: true,
			outdir: "./dist/js",
			entryNames: "app",
			chunkNames: "chunks/[name]-[hash]",
		});
		browserSync.stream();
	} catch (error) {
		notify.onError()(error);
		throw error;
	}
};

const resources = () => {
	// DMSans is an inactive backup font (kept in src/resources/fonts but not
	// referenced in CSS). Exclude it from the build so it is never shipped or
	// downloaded. Remove the negations to ship it again.
	return src([
		"./src/resources/**",
		"!./src/resources/fonts/DMSans-*.woff",
		"!./src/resources/fonts/DMSans-*.woff2",
	])
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
					minifyJS: false,
				}),
			),
		)
		.pipe(dest("./dist"))
		.pipe(browserSync.stream());
};

const cache = () => {
	return src(
		[
			"dist/**/*.{css,js,svg,jpg,jpeg,webp,woff2,woff}",
			"dist/img/**/*.png",
			"!dist/favicon/**",
			"!dist/js/chunks/**",
			/* Public login bundle must keep a stable URL for the edge allowlist. */
			"!dist/js/login-gate.js",
			/* SW must stay at /sw.js — pwa.js registers that exact path. */
			"!dist/sw.js",
		],
		{
			base: "dist",
		},
	)
		.pipe(rev())
		.pipe(revDel())
		.pipe(dest("dist"))
		.pipe(rev.manifest("rev.json"))
		.pipe(dest("dist"));
};

function rewriteCss() {
	const manifest = readFileSync("dist/rev.json");

	return src("dist/css/*.css")
		.pipe(
			revRewrite({
				manifest,
			}),
		)
		.pipe(dest("dist/css"));
}

function rewriteHtml() {
	const manifest = readFileSync("dist/rev.json");

	return src("dist/**/*.html")
		.pipe(
			revRewrite({
				manifest,
			}),
		)
		.pipe(dest("dist"));
}

const rewrite = parallel(rewriteCss, rewriteHtml);

const DEV_FONT_FILES = [
	"./dist/fonts/SairaSemiCondensed-Regular.woff2",
	"./dist/fonts/SairaSemiCondensed-Medium.woff2",
	"./dist/fonts/SairaSemiCondensed-SemiBold.woff2",
	"./dist/fonts/SairaSemiCondensed-Bold.woff2",
];

const DEV_FAVICON_FILES = [
	"./dist/favicon/favicon-32x32.png",
	"./dist/favicon/apple-icon-180x180.png",
];

const ensureDevAssets = (done) => {
	if (isProduction) {
		done();
		return;
	}

	const needsCss = !existsSync("./dist/css/style.css");
	const needsJs =
		!existsSync("./dist/js/app.js") || !existsSync("./dist/js/login-gate.js");
	const needsResources =
		DEV_FONT_FILES.some((file) => !existsSync(file)) ||
		DEV_FAVICON_FILES.some((file) => !existsSync(file));

	if (!needsCss && !needsJs && !needsResources) {
		done();
		return;
	}

	const tasks = [];
	if (needsCss) tasks.push(stylesBackend);
	if (needsJs) tasks.push(scriptsBundle);
	if (needsResources) tasks.push(resources);

	series(...tasks)(done);
};

const htmlIncludeDev = series(htmlInclude, ensureDevAssets);

const restoreDevAssets = series(
	cleanHashedAssets,
	htmlInclude,
	scriptsBundle,
	stylesBackend,
	resources,
);

const watchFiles = () => {
	browserSync.init({
		server: {
			baseDir: "./dist",
			middleware: [protectDevAssets],
		},
		open: false,
		notify: false,
	});

	watch("./src/scss/**/*.scss", stylesBackend);
	watch("./src/js/**/*.js", scriptsBundle);
	watch("./src/partials/*.html", htmlIncludeDev);
	watch("./src/partials/connected/*.html", htmlIncludeDev);
	watch("./src/partials/sections/*.html", htmlIncludeDev);
	watch("./src/*.html", htmlIncludeDev);
	watch("./src/resources/**", resources);
	watch("./src/img/*.{jpg,jpeg,png,svg,webp}", images);
	watch("./src/img/**/*.{jpg,jpeg,png,svg,webp}", images);
	watch("./src/img/svg/**.svg", images);
	watch("./dist/rev.json", { ignoreInitial: true }, restoreDevAssets);
};

exports.default = series(
	cleanHashedAssets,
	htmlInclude,
	scriptsBundle,
	stylesBackend,
	resources,
	images,
	ensureDevAssets,
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
