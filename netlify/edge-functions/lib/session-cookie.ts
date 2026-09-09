import * as jose from "https://esm.sh/jose@5.9.6?target=deno";

export const SESSION_COOKIE = "hayshed_id";
export const SESSION_TYP = "hayshed";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30;

export const ALLOWED_EMAILS = new Set([
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

const PROJECT_ID = Deno.env.get("FIREBASE_PROJECT_ID") || "";
const SESSION_SECRET = Deno.env.get("SESSION_SECRET") || "";

const JWKS = jose.createRemoteJWKSet(
	new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

export function readCookie(request: Request, name: string): string {
	const raw = request.headers.get("cookie") || "";
	const parts = raw.split(";").map((part) => part.trim());
	for (const part of parts) {
		if (part.startsWith(`${name}=`)) {
			return decodeURIComponent(part.slice(name.length + 1));
		}
	}
	return "";
}

function sessionKey(): Uint8Array | null {
	if (!SESSION_SECRET || SESSION_SECRET.length < 16) return null;
	return new TextEncoder().encode(SESSION_SECRET);
}

function parseServiceAccount(): { clientEmail: string; privateKey: string } | null {
	const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT") || "";
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw);
		const clientEmail = typeof parsed.client_email === "string" ? parsed.client_email : "";
		const privateKey = typeof parsed.private_key === "string" ? parsed.private_key : "";
		if (!clientEmail || !privateKey) return null;
		return { clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") };
	} catch {
		return null;
	}
}

export function buildSessionCookieHeader(token: string, maxAge = SESSION_MAX_AGE_SEC): string {
	return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookieHeader(): string {
	return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function createAppSessionToken(email: string, uid: string): Promise<string | null> {
	const key = sessionKey();
	if (!key || !uid) return null;
	return new jose.SignJWT({
		email: email.toLowerCase(),
		uid,
		typ: SESSION_TYP,
	})
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(`${SESSION_MAX_AGE_SEC}s`)
		.sign(key);
}

export async function readAppSession(
	token: string,
): Promise<{ email: string; uid: string } | null> {
	const key = sessionKey();
	if (!key || !token) return null;
	try {
		const { payload } = await jose.jwtVerify(token, key, {
			algorithms: ["HS256"],
		});
		if (payload.typ !== SESSION_TYP) return null;
		const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
		const uid = typeof payload.uid === "string" ? payload.uid : "";
		if (!email || !uid || !ALLOWED_EMAILS.has(email)) return null;
		return { email, uid };
	} catch {
		return null;
	}
}

async function verifyAppSessionToken(token: string): Promise<boolean> {
	return Boolean(await readAppSession(token));
}

async function verifyFirebaseToken(
	token: string,
): Promise<{ ok: boolean; email: string; uid: string }> {
	if (!token || !PROJECT_ID) return { ok: false, email: "", uid: "" };
	try {
		const { payload } = await jose.jwtVerify(token, JWKS, {
			issuer: `https://securetoken.google.com/${PROJECT_ID}`,
			audience: PROJECT_ID,
		});
		const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
		const uid =
			typeof payload.user_id === "string"
				? payload.user_id
				: typeof payload.sub === "string"
					? payload.sub
					: "";
		if (!email || !uid || !ALLOWED_EMAILS.has(email)) {
			return { ok: false, email: "", uid: "" };
		}
		return { ok: true, email, uid };
	} catch {
		return { ok: false, email: "", uid: "" };
	}
}

export async function verifyRequestSession(token: string): Promise<boolean> {
	if (!token) return false;
	if (await verifyAppSessionToken(token)) return true;
	const firebase = await verifyFirebaseToken(token);
	return firebase.ok;
}

export async function verifyFirebaseIdToken(
	token: string,
): Promise<{ ok: boolean; email: string; uid: string }> {
	return verifyFirebaseToken(token);
}

export function hasSessionSecret(): boolean {
	return Boolean(sessionKey());
}

export function canMintCustomToken(): boolean {
	return Boolean(parseServiceAccount());
}

export async function mintFirebaseCustomToken(uid: string): Promise<string | null> {
	const sa = parseServiceAccount();
	if (!sa || !uid) return null;
	try {
		const key = await jose.importPKCS8(sa.privateKey, "RS256");
		return await new jose.SignJWT({ uid })
			.setProtectedHeader({ alg: "RS256", typ: "JWT" })
			.setIssuer(sa.clientEmail)
			.setSubject(sa.clientEmail)
			.setAudience(
				"https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
			)
			.setIssuedAt()
			.setExpirationTime("1h")
			.sign(key);
	} catch {
		return null;
	}
}
