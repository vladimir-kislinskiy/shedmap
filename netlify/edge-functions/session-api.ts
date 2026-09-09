import type { Config, Context } from "https://edge.netlify.com";
import {
	buildSessionCookieHeader,
	canMintCustomToken,
	clearSessionCookieHeader,
	createAppSessionToken,
	hasSessionSecret,
	mintFirebaseCustomToken,
	readAppSession,
	readCookie,
	SESSION_COOKIE,
	verifyFirebaseIdToken,
} from "./lib/session-cookie.ts";

function json(body: Record<string, unknown>, status = 200, extraHeaders: HeadersInit = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "no-store",
			...extraHeaders,
		},
	});
}

export default async (request: Request, _context: Context) => {
	if (request.method === "OPTIONS") {
		return new Response(null, {
			status: 204,
			headers: {
				Allow: "POST, DELETE, OPTIONS",
				"Cache-Control": "no-store",
			},
		});
	}

	if (request.method === "DELETE") {
		return json(
			{ ok: true },
			200,
			{ "Set-Cookie": clearSessionCookieHeader() },
		);
	}

	if (request.method !== "POST") {
		return json({ ok: false, error: "method_not_allowed" }, 405);
	}

	let body: Record<string, unknown> = {};
	try {
		body = await request.json();
	} catch {
		body = {};
	}

	if (body.restore === true) {
		if (!hasSessionSecret() || !canMintCustomToken()) {
			return json({ ok: false, error: "restore_unavailable" }, 503);
		}
		const session = await readAppSession(readCookie(request, SESSION_COOKIE));
		if (!session) {
			return json({ ok: false, error: "no_session" }, 401);
		}
		const customToken = await mintFirebaseCustomToken(session.uid);
		if (!customToken) {
			return json({ ok: false, error: "mint_failed" }, 503);
		}
		return json({ ok: true, customToken });
	}

	if (!hasSessionSecret()) {
		return json({ ok: false, error: "session_secret_missing" }, 503);
	}

	const idToken = typeof body.idToken === "string" ? body.idToken : "";
	const verified = await verifyFirebaseIdToken(idToken);
	if (!verified.ok || !verified.email || !verified.uid) {
		return json({ ok: false, error: "invalid_token" }, 401);
	}

	const sessionToken = await createAppSessionToken(verified.email, verified.uid);
	if (!sessionToken) {
		return json({ ok: false, error: "session_create_failed" }, 503);
	}

	return json(
		{ ok: true },
		200,
		{ "Set-Cookie": buildSessionCookieHeader(sessionToken) },
	);
};

export const config: Config = {
	path: "/api/session",
};
