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
3. Create authorized users (e.g. `operations@barr-ag.com`). Add emails to `AUTHORIZED_EMAILS` in `src/js/auth.js`.
4. Copy `.env.example` to `.env` and paste your Firebase web config values.
5. Deploy database rules from `database.rules.json`:

```bash
firebase deploy --only database
```

Or paste the rules manually in Firebase Console → Realtime Database → Rules.

### Authorized accounts

Login uses **email + password**. The person name in the change log is taken automatically from the email:

| Email                   | Person  |
|-------------------------|---------|
| operations@barr-ag.com  | Vlad    |
| tschmitt@barr-ag.com    | Tyler   |
| rschmitt@barr-ag.com    | Ryley   |
| tbeschmitt@barr-ag.com  | Taylor  |
| nmathis@barr-ag.com     | Natalie |

Add or update mappings in `src/js/auth.js` → `USERS`.

Firebase config is **not** stored in source code. Set `FIREBASE_*` variables in `.env` for local builds and in Netlify **Site configuration → Environment variables** for production.

If GitHub flagged an exposed API key:

1. **Rotate** the key in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → select the Firebase API key → Regenerate (or create a new key and update Firebase).
2. **Restrict** the key: Application restrictions → HTTP referrers → add your domains (`localhost`, `*.netlify.app`, custom domain).
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
| `npm run cache` | Asset fingerprinting   |

## License

Private — all rights reserved.
