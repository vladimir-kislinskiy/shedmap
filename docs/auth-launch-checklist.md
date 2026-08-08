# Auth launch checklist (Shed Map)

Passwords are **not** stored in this repo. Keep them only in your private list / password manager.

## Roles

| Role | Rights |
|------|--------|
| **admin** | Full inventory edit (all locations) |
| **user** | View only (map, reports, PDF) |
| **super** | `operations@barr-ag.com` only — backup tools + CB theme toggle |

Registry lives in `src/js/auth.js` → `AUTH_USERS`.

Temporary emergency account: `logistic@barr-ag.com` (role **user** — change password after each use).

---

## Before Monday (prep)

### 1. Create Firebase Auth users

Firebase Console → **Authentication** → **Users** → **Add user** for each email in `AUTH_USERS`.

- Use the passwords from your private spreadsheet (not from git).
- Leave existing accounts as-is; update password if needed.
- New accounts: email/password only.

Checklist emails (18):

```
admin@barr-ag.com
bdyson@barr-ag.com
bschmitt@barr-ag.com
cbrocklebank@barr-ag.com
clee@barr-ag.com
dehy@barr-ag.com
jbergeson@barr-ag.com
nmathis@barr-ag.com
operations@barr-ag.com
rschmitt@barr-ag.com
scale@barr-ag.com
shisadomi@barr-ag.com
siksika@barr-ag.com
ssakamoto@barr-ag.com
tbeschmitt@barr-ag.com
tschmitt@barr-ag.com
loader@barr-ag.com
logistic@barr-ag.com
```

### 2. Deploy **current** database rules (write-admins only, **public read** still on)

```bash
npm run deploy:rules
```

Uses `database.rules.json`:

- `.read: true` on `hayShedState` (guests still see data this week)
- `.write` only for admin emails (Natalie, Vlad, Ryley, Taylor, Tyler)
- `siksika@` no longer has write (user role)

### 3. Test logins this week

- Sign in as **admin** → gear, edit, drag.
- Sign in as **user** → view only (same as guest UI for editing).
- Sign out works.

`REQUIRE_AUTH` in `src/js/auth.js` is still **`false`** → map works without login until Sunday.

### 4. Monday onward

Hand out email + password + role to each person. Ask admins to change password after first login if policy requires it.

---

## Sunday cutover (hard login)

Do in order:

### A. App flag

In `src/js/auth.js`:

```js
export const REQUIRE_AUTH = true;
```

Build + deploy frontend to Netlify.

### B. Locked database rules

```bash
cp database.rules.locked.json database.rules.json
npm run deploy:rules
```

Or deploy the locked file path if you extend the deploy script.

`database.rules.locked.json`:

- **read** only if signed in + email in allowlist
- **write** only admins
- No anonymous data

### C. Smoke test (private window)

1. No login → sign-in required, **no map data**.
2. User login → map + reports OK, no inventory form.
3. Admin login → full edit + save.
4. Super (`operations@`) → backup + CB toggle.
5. Wrong password → error.
6. Unknown email (even if Auth account exists but not in `AUTH_USERS`) → signed out.

### D. After cutover

- Monitor Firebase Auth **Signed in** column for issues.
- If emergency access needed: hand `logistic@` password, then **reset password** after use.

---

## Adding a new person later

1. Firebase Auth → Add user.
2. Add to `AUTH_USERS` in `src/js/auth.js` with `name` + `role`.
3. Deploy app.
4. If hard login is already on, also add email to **read** (and **write** if admin) in `database.rules.json` / locked rules + `npm run deploy:rules`.

---

## Rollback (if needed)

1. Set `REQUIRE_AUTH = false`, redeploy app.
2. Restore previous rules with public read (backup of current `database.rules.json` before Sunday).
3. redeploy rules.
