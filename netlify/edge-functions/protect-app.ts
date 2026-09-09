import type { Config, Context } from "https://edge.netlify.com";
import {
	readCookie,
	SESSION_COOKIE,
	verifyRequestSession,
} from "./lib/session-cookie.ts";

const ALWAYS_PUBLIC = [
	/^\/api\/session$/,
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
	const valid = await verifyRequestSession(token);

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
