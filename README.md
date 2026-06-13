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
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production build

```bash
npm run build
```

Output is written to the `dist/` folder.

## Firebase Setup

1. Create a Firebase project and enable **Realtime Database**.
2. Enable **Email/Password** sign-in under Authentication.
3. Create authorized users (e.g. `operations@barr-ag.com`). Add emails to `AUTHORIZED_EMAILS` in `src/js/auth.js`.
4. Deploy database rules from `database.rules.json`:

```bash
firebase deploy --only database
```

Or paste the rules manually in Firebase Console → Realtime Database → Rules.

### Authorized accounts

Login uses **email + password** (Firebase Authentication). Currently allowed:

| Email                   | Access        |
|-------------------------|---------------|
| operations@barr-ag.com  | Edit inventory |

After sign-in, select **Person** in the inventory form to record who made each change in the log.

Add more emails in `src/js/auth.js` → `AUTHORIZED_EMAILS`.

Firebase config lives in `src/js/main.js`. Client-side API keys are safe to expose; write access is enforced by Firebase Security Rules.

## Deploy to Netlify

The repo includes `netlify.toml` — Netlify will run `npm run build` and publish the `dist/` folder automatically.

1. Connect the GitHub repo in Netlify.
2. Push to `main` — deploy runs on every push.
3. Add `shedmap.netlify.app` (or your custom domain) to **Firebase → Authentication → Settings → Authorized domains**.

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
