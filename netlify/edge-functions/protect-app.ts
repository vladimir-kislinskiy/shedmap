import type { Config, Context } from "https://edge.netlify.com";
import * as jose from "https://esm.sh/jose@5.9.6?target=deno";

const SESSION_COOKIE = "hayshed_id";
const PROJECT_ID = Deno.env.get("FIREBASE_PROJECT_ID") || "";

const JWKS = jose.createRemoteJWKSet(
	new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

const PUBLIC_PATHS = [
	/^\/$/,
	/^\/index\.html$/,
	/^\/js\/login-gate(?:-[a-zA-Z0-9]+)?\.js$/,
	/^\/favicon(?:\/|$)/,
	/^\/apple-touch-icon(?:-[\w.]+)?\.png$/,
	/^\/favicon\.ico$/,
	/^\/sw\.js$/,
];

function isPublicPath(pathname: string): boolean {
	return PUBLIC_PATHS.some((re) => re.test(pathname));
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
	if (!token || !PROJECT_ID) return false;
	try {
		await jose.jwtVerify(token, JWKS, {
			issuer: `https://securetoken.google.com/${PROJECT_ID}`,
			audience: PROJECT_ID,
		});
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
	if (isPublicPath(url.pathname)) {
		return context.next();
	}

	const token = readCookie(request, SESSION_COOKIE);
	const valid = await verifyFirebaseToken(token);
	if (valid) {
		return context.next();
	}

	if (wantsHtml(request) || url.pathname.endsWith(".html") || url.pathname === "/app" || url.pathname === "/app.html") {
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
