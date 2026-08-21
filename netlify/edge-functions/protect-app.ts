import type { Config, Context } from "https://edge.netlify.com";
import * as jose from "https://esm.sh/jose@5.9.6?target=deno";

const SESSION_COOKIE = "hayshed_id";
const PROJECT_ID = Deno.env.get("FIREBASE_PROJECT_ID") || "";

const ALLOWED_EMAILS = new Set([
	"admin@barr-ag.com",
	"bdyson@barr-ag.com",
	"bschmitt@barr-ag.com",
	"cbrocklebank@barr-ag.com",
	"clee@barr-ag.com",
	"dehy@barr-ag.com",
	"jbergeson@barr-ag.com",
	"nmathis@barr-ag.com",
	"operations@barr-ag.com",
	"rschmitt@barr-ag.com",
	"scale@barr-ag.com",
	"shisadomi@barr-ag.com",
	"siksika@barr-ag.com",
	"ssakamoto@barr-ag.com",
	"tbeschmitt@barr-ag.com",
	"tschmitt@barr-ag.com",
	"loader@barr-ag.com",
	"logistic@barr-ag.com",
]);

const JWKS = jose.createRemoteJWKSet(
	new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

const ALWAYS_PUBLIC = [
	/^\/js\/login-gate(?:-[a-zA-Z0-9]+)?\.js$/,
	/^\/favicon(?:\/|$)/,
	/^\/apple-touch-icon(?:-[\w.]+)?\.png$/,
	/^\/favicon\.ico$/,
	/^\/sw\.js$/,
];

function isAlwaysPublic(pathname: string): boolean {
	return ALWAYS_PUBLIC.some((re) => re.test(pathname));
}

function isRoot(pathname: string): boolean {
	return pathname === "/" || pathname === "/index.html";
}

function isLegacyAppPath(pathname: string): boolean {
	return pathname === "/app.html" || pathname === "/app";
}

function readCookie(request: Request, name: string): string {
	const raw = request.headers.get("cookie") || "";
	const parts = raw.split(";").map((part) => part.trim());
	for (const part of parts) {
		if (part.startsWith(`${name}=`)) {
			return decodeURIComponent(part.slice(name.length + 1));
		}
	}
	return "";
}

async function verifyFirebaseToken(token: string): Promise<boolean> {
	if (!token) return false;
	if (!PROJECT_ID) return false;

	try {
		const { payload } = await jose.jwtVerify(token, JWKS, {
			issuer: `https://securetoken.google.com/${PROJECT_ID}`,
			audience: PROJECT_ID,
		});
		const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
		if (!email || !ALLOWED_EMAILS.has(email)) return false;
		return true;
	} catch {
		return false;
	}
}

function wantsHtml(request: Request): boolean {
	const accept = request.headers.get("accept") || "";
	return accept.includes("text/html");
}

export default async (request: Request, context: Context) => {
	const url = new URL(request.url);
	const { pathname } = url;

	if (isAlwaysPublic(pathname)) {
		return context.next();
	}

	const token = readCookie(request, SESSION_COOKIE);
	const valid = await verifyFirebaseToken(token);

	if (isRoot(pathname)) {
		if (valid) {
			return context.rewrite("/app.html");
		}
		return context.next();
	}

	if (isLegacyAppPath(pathname)) {
		return Response.redirect(new URL("/", url), 302);
	}

	if (valid) {
		return context.next();
	}

	if (wantsHtml(request) || pathname.endsWith(".html")) {
		return Response.redirect(new URL("/", url), 302);
	}

	return new Response("Unauthorized", {
		status: 401,
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
};

export const config: Config = {
	path: "/*",
};
