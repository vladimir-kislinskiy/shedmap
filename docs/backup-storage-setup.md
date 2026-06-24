# Automated backups (free, GitHub only)

No Google Cloud billing, no Netlify storage, no paid services.

## How it works

| What | Details |
|------|---------|
| **Schedule** | Every day at ~**11:59 PM Alberta** (MDT) |
| **Source** | Firebase Realtime Database → `hayShedState` |
| **Storage** | Git branch **`backups`** in this repo → folder `daily/` |
| **Retention** | 365 days (older files deleted automatically) |
| **Extra copy** | GitHub Actions artifact (14 days) for quick download |

Example file path on GitHub:

```
backups branch → daily/hay-shed-backup-2026-06-24.json
```

Browse: **Code** → branch dropdown → **backups** → `daily/`

## One-time setup

### 1. GitHub variable (you already have this)

| Name | Type | Value |
|------|------|--------|
| `SHEDMAP` | **Variable** | `https://hayshed-f65b3-default-rtdb.firebaseio.com` |

### 2. Push the workflow

```bash
git push
```

### 3. Test manually

**Actions** → **Database backup** → **Run workflow**

After a green run:

- Branch **`backups`** appears in the repo
- File `daily/hay-shed-backup-YYYY-MM-DD.json` is inside

## Restore

1. GitHub → branch **backups** → open JSON → **Download raw file** (or **Raw** → Save as)
2. App → sign in as `operations@barr-ag.com` → **Change Log** → **Restore from file**

Or locally:

```bash
git fetch origin backups
git checkout backups
# file is at daily/hay-shed-backup-YYYY-MM-DD.json
```

## Cost

- **$0** on GitHub Free (private repo is fine)
- Backup files are small (typically KB–low MB); 365 daily files stay well within normal repo limits

## Schedule note

Cron `59 5 * * *` UTC = **11:59 PM MDT** (summer). In winter (MST) the run is at **10:59 PM** local. To shift by one hour, edit `.github/workflows/backup-database.yml`.
