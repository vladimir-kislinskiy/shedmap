# Hay Shed Map

Real-time hay shed inventory map. Track bale stacks across North, West, and East sheds with live Firebase sync, change log, and role-based access.

## Features

- Interactive shed map with alfalfa / timothy stacks
- Add, remove, and reorder bales within rows
- Real-time sync via Firebase Realtime Database
- Change log with person, action, contract, and bale count
- **View-only mode** for guests (read-only access)
- **Edit mode** for authenticated team members

## Tech Stack

- HTML / SCSS / vanilla JavaScript (ES modules)
- Gulp build pipeline
- Firebase Realtime Database + Firebase Authentication

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install & run locally

```bash
npm install
cp .env.example .env
```

Fill in `.env` with your Firebase web app config (Firebase Console → Project settings → Your apps).

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production build

```bash
npm run build
```

Output is written to the `dist/` folder. Firebase values are injected from environment variables at build time (see `.env.example`).

## Firebase Setup

1. Create a Firebase project and enable **Realtime Database**.
2. Enable **Email/Password** sign-in under Authentication.
3. Create authorized users in Firebase Console (do **not** allow public sign-up — see Security below).
4. Copy `.env.example` to `.env` and paste your Firebase web config values.
5. Deploy database rules from `database.rules.json`:

```bash
npm run deploy:rules
```

First run opens a browser for one-time Firebase login. The script installs Node 20 and firebase-tools locally in `.tools/` (no `sudo` needed).

Or paste `database.rules.json` manually in Firebase Console → Realtime Database → Rules → **Publish**.

### Authorized accounts

Login uses **email + password**. The person name in the change log is taken automatically from the email:

| Email                   | Person  |
|-------------------------|---------|
| operations@barr-ag.com  | Vlad    |
| tschmitt@barr-ag.com    | Tyler   |
| rschmitt@barr-ag.com    | Ryley   |
| tbeschmitt@barr-ag.com  | Taylor  |
| nmathis@barr-ag.com     | Natalie |

Add or update mappings in `src/js/auth.js` → `USERS` (and the same emails in `database.rules.json`).

### Security checklist

1. **Disable public sign-up:** Firebase Console → Authentication → Settings → **User account creation** → disable *Allow users to sign up* (wording may vary). Only create users manually in the Users tab.
2. **Deploy database rules** after any change: `firebase deploy --only database`
3. **API key referrers** in Google Cloud: `localhost`, `127.0.0.1`, `*.netlify.app`, `*.firebaseapp.com`, `*.web.app`, and any custom domain.
4. Use strong unique passwords for each team account.

Firebase config is **not** stored in source code. Set `FIREBASE_*` in `.env` (local) and Netlify environment variables (production).

If GitHub flagged an exposed API key:

1. **Rotate** the key in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → select the Firebase API key → Regenerate (or create a new key and update Firebase).
2. **Restrict** the key: Application restrictions → HTTP referrers → add your domains (`localhost`, `127.0.0.1`, `*.netlify.app`, `https://YOUR-PROJECT.firebaseapp.com/*`, `https://YOUR-PROJECT.web.app/*`, custom domain).
3. Update `.env` and Netlify env vars with the new key.
4. Push this repo change so the key is no longer in `src/js/main.js`. Old commits may still contain it; rotation limits the damage.

## Deploy to Netlify

The repo includes `netlify.toml` — Netlify will run `npm run build` and publish the `dist/` folder automatically.

1. Connect the GitHub repo in Netlify.
2. Add these environment variables in **Site configuration → Environment variables** (values from Firebase Console):

   - `FIREBASE_API_KEY`
   - `FIREBASE_AUTH_DOMAIN`
   - `FIREBASE_DATABASE_URL`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_STORAGE_BUCKET`
   - `FIREBASE_MESSAGING_SENDER_ID`
   - `FIREBASE_APP_ID`

3. Push to `main` — deploy runs on every push.
4. Add `shedmap.netlify.app` (or your custom domain) to **Firebase → Authentication → Settings → Authorized domains**.

If you see "Page not found", check **Site configuration → Build settings**:
- **Build command:** `npm run build`
- **Publish directory:** `dist`

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. Go to **Settings → Pages → Build and deployment**.
3. Set source to **GitHub Actions**.
4. Push to `main` — the workflow in `.github/workflows/deploy.yml` builds and deploys automatically.

## Project Structure

```
src/
  index.html          # Main page
  js/
    main.js           # App logic & Firebase sync
    firebase-config.js # Firebase config from env at build time
    auth.js           # Authentication
  scss/               # Styles
  partials/           # HTML includes
database.rules.json   # Firebase security rules
gulpfile.js           # Build config
```

## Scripts

| Command       | Description              |
|---------------|--------------------------|
| `npm run dev` | Dev server with live reload |
| `npm run build` | Production build       |
| `npm run backup` | Download JSON backup from Firebase (uses `.env`) |
| `npm run cache` | Asset fingerprinting   |

## Backups

The app stores everything in Firebase Realtime Database (`hayShedState`). Three layers protect against outages or bad writes:

1. **In the app (Change Log tab, admin only)** — after signing in as `operations@barr-ag.com`, a backup panel is injected dynamically. Other users never receive this UI or its JavaScript chunk.
2. **On your machine** — `npm run backup` saves `backups/hayShedState-<timestamp>.json` using `FIREBASE_DATABASE_URL` from `.env`.
3. **GitHub Actions (automatic, free)** — every day at **~11:59 PM Alberta time** commits a JSON file to branch **`backups`** (`daily/hay-shed-backup-YYYY-MM-DD.json`). Keeps 365 days. No Google Cloud or billing required.

Details: [docs/backup-storage-setup.md](docs/backup-storage-setup.md)

### GitHub configuration

| Item | Type | Value |
|------|------|--------|
| `SHEDMAP` | **Variable** (or secret) | `https://YOUR-PROJECT-default-rtdb.firebaseio.com` |

That is all that is required. After push: **Actions → Database backup → Run workflow** once to create the `backups` branch.

### Restore procedure

1. Get a `.json` file (admin export in app, branch `backups` on GitHub, or Actions artifact).
2. Sign in as admin → **Change Log** → **Restore from file**.
3. Verify sheds and change log in the UI.

## License

Private — all rights reserved.
