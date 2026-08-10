# Auth launch checklist (Shed Map)

Passwords are **not** stored in this repo. Keep them only in your private list / password manager.

## Absolute rule

**Before login: no access to application code or data.**

- Public URL (`/`): login popup + message to contact **Vlad** for credentials.
- Protected (Netlify Edge + session cookie): `/app.html`, `/js/app*`, `/css/*`, fonts, chunks, etc.
- Firebase RTDB: read/write only for signed-in allowlisted accounts (`database.rules.json` locked).

---

## Roles

| Role | Rights |
|------|--------|
| **admin** | Full inventory edit (all locations) |
| **user** | View only (map, reports, PDF) |
| **super** | `operations@barr-ag.com` only — backup tools + CB theme toggle |

Registry (names/roles): **Firebase RTDB** `userProfiles/*` (seed: `data/user-profiles.json`).  
**Not** in client JS — each account can read only its own row.

Temporary emergency account: `logistic@barr-ag.com` (role **user** — change password after each use).

---

## Architecture

| Piece | Role |
|-------|------|
| `src/index.html` + `login-gate.js` | Only public UI (inline CSS, contact Vlad) — **no email list** |
| `src/app.html` + `app.js` | Full app (edge-protected) — **no email directory in JS** |
| `userProfiles/{key}` | name + role per email (read-only own profile) |
| Cookie `hayshed_id` | Firebase ID token, set on login |
| `netlify/edge-functions/protect-app.ts` | Verifies JWT; blocks raw asset URLs without cookie |
| `REQUIRE_AUTH = true` | Client redirect to `/` if session lost |
| Locked RTDB rules | No anonymous data |

### Seed profiles (required once / when adding people)

```bash
npm run seed:profiles
npm run deploy:rules
```

---

## Before / at deploy

### 1. Firebase Auth users

Create each email in `AUTH_USERS` (Authentication → Users).

### 2. Netlify env

Same `FIREBASE_*` as build. **`FIREBASE_PROJECT_ID` must be set** (edge verifies tokens against it).

### 3. Deploy frontend (includes edge function)

```bash
npm run build
# deploy dist / Netlify site as usual
```

### 4. Deploy locked database rules

```bash
npm run deploy:rules
```

Uses locked `database.rules.json` (read allowlist, write admins only).

### 5. Smoke test (private window)

1. Open site → **only** sign-in screen + “contact Vlad”.
2. Direct URL `/app.html` or `/js/app.js` → redirect or **401** (no app code).
3. Log in → map works.
4. User role → view only; admin → edit.
5. Sign out → back to login; assets blocked again.
6. Wrong password → error; unknown email not in allowlist → denied.

---

## Adding a person later

1. Firebase Auth → Add user.
2. `AUTH_USERS` in `src/js/auth.js`.
3. Same email in `database.rules.json` (and `database.rules.locked.json`) read list; write list if admin.
4. Deploy app + `npm run deploy:rules`.

---

## Rollback (emergency)

1. Temporarily relax edge function / unset path (or set cookie gate bypass — avoid if possible).
2. Soften `database.rules.json` read if data must be public again.
3. Redeploy app + rules.

Prefer fixing accounts over public reopening.
