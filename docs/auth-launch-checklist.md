# Auth launch checklist (Shed Map)

Passwords are **not** stored in this repo. Keep them only in your private list / password manager.

## Absolute rule

**Before login: no access to application code or data.**

- Public URL (`/`): login UI + message to contact **Vlad** for credentials.
- Protected (Netlify Edge + session cookie): `/app.html`, `/js/app*`, `/css/*`, fonts, chunks, etc.
- Firebase RTDB: read/write only for signed-in allowlisted accounts (`database.rules.json` locked).

---

## Roles

| Role | Rights |
|------|--------|
| **admin** | Full inventory edit (all locations) |
| **user** | View only (map, reports, PDF, stack detail) |
| **super** | `operations@barr-ag.com` — backup tools |

Client registry: `AUTH_USERS` in `src/js/auth.js` (inside the protected app bundle).  
Edge allowlist: same emails in `netlify/edge-functions/protect-app.ts`.  
RTDB allowlist: `database.rules.json` (must stay in sync when adding people).

Temporary emergency account: `logistic@barr-ag.com` (role **user** — change password after each use).

---

## Architecture

| Piece | Role |
|------|------|
| `src/index.html` + `login-gate.js` | Public login only (inline CSS, contact Vlad) |
| `src/app.html` + `app.js` | Full app (edge-protected) |
| Cookie `hayshed_id` | **HttpOnly** app session JWT (~30 days), issued by `/api/session` after Firebase ID token verify |
| `session-api.ts` | `POST { idToken }` → set cookie; `POST { restore:true }` → Firebase custom token; `DELETE` → clear |
| `protect-app.ts` | Accepts app session JWT **or** (legacy) Firebase ID token; email allowlist |
| `REQUIRE_AUTH = true` | Client restore via custom token when IndexedDB was wiped (common on iPhone PWA) |
| Locked RTDB rules | No anonymous data |

Why iPhone PWAs re-prompted login: the old cookie stored a Firebase **ID token** (~1 hour). Edge rejected it after expiry. Desktop/iPad often restored Auth from IndexedDB; iPhone home-screen WebKit clears that storage aggressively, so users saw the login screen again. Fix: long-lived HttpOnly session + silent Firebase restore via service-account custom token.

---

## Before / at deploy

### 1. Firebase Auth users

Create each email from `AUTH_USERS` (Authentication → Users).

### 2. Netlify env

Same `FIREBASE_*` as build. **`FIREBASE_PROJECT_ID` must be set**.

Also set:

| Var | Purpose |
|-----|---------|
| **`SESSION_SECRET`** | Long random string (32+ chars). Signs the 30-day HttpOnly cookie. |
| **`FIREBASE_SERVICE_ACCOUNT`** | Full service account JSON (one line). Mints custom tokens so iPhone PWA can reopen without the login form after WebKit wipes IndexedDB. |

Without these, login still works, but iPhone may ask for password again on every cold start.

### 3. Deploy frontend (includes edge function)

```bash
npm run build
# deploy dist / Netlify site as usual
```

### 4. Deploy locked database rules

```bash
npm run deploy:rules
```

### 5. Smoke test (private window)

**Unauthenticated (can run without login):**

1. Open site → **only** sign-in screen + “contact Vlad”.
2. Direct URL `/app.html` → redirect to `/`.
3. Direct URL `/js/app.js` → **401**.
4. Fake cookie → still **401** on app assets.

**Authenticated:**

5. Log in → map loads; URL stays `/`.
6. User role → view only (tap stack → detail); admin → edit + sidebar.
7. Phone: vertical + horizontal pan on sheds; long-press to drag (editors).
8. Airplane mode → edit → reconnect → changes sync (banner may show briefly).
9. Sign out → back to login; assets blocked again.
10. Wrong password → error; Firebase user not on allowlist → cannot open app.

---

## Adding a person later

1. Firebase Auth → Add user.
2. `AUTH_USERS` in `src/js/auth.js`.
3. Same email in `protect-app.ts` `ALLOWED_EMAILS`.
4. Same email in `database.rules.json` (and `database.rules.locked.json`) read list; write list if editor/admin.
5. Deploy app + `npm run deploy:rules`.

---

## Rollback (emergency)

1. Prefer fixing accounts over public reopening.
2. Soften `database.rules.json` only if data must be readable again.
3. Redeploy app + rules.
