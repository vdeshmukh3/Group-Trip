# Group Trip — expense splitter

Create a group trip, add people, log expenses (who paid, who the expense is split with), and see balances plus who should pay whom.

## Quick start

```bash
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..
npm run dev
```

- **App:** http://localhost:5173  
- **API:** http://localhost:3001  

Share the trip page URL or trip code so others can open the same trip and add expenses.

## Data storage

Trip data is stored in `server/data/trips.xlsx` (or under `DATA_DIR` when configured).
The workbook has separate `Trips`, `Members`, `Expenses`, and `ExpenseSplits` sheets.
When the app starts without a workbook, it imports any existing `trips.db` once and
creates the workbook. The original database file is left in place as a backup; all
new changes are written to Excel.

## Group password

The app opens with a shared password screen. The default password is `grouptrip2026`.
To use a different password, set `VITE_APP_PASSWORD` in the client build environment
before building. This browser-side gate is intended for casual access control; it
does not secure the API or encrypt trip data.

## How expenses work

1. Choose **who paid** and the **total amount**.
2. Select **which people** the expense is for (equal split among checked people).
3. The app computes each person’s **paid vs. fair share** and shows:
   - **Settle up** — fewest payments to clear everyone.
   - **Give / take by person** — direct owes-from-each-expense view (netted where A↔B owe each other).

## Production

```bash
npm run install:all
npm run build
npm start
```

Serves the built UI from the API on port 3001 (or `PORT`).

## Deploy on Render

One **Web Service** serves both the React app and the API (same as local production).

### Option A — Blueprint (recommended)

1. Push this repo to **GitHub** (or GitLab).
2. In [Render](https://render.com) → **New** → **Blueprint**.
3. Connect the repo; Render reads `render.yaml` (includes a **1 GB disk** at `/var/data` for the workbook).
4. Deploy. Your app URL will look like `https://group-trip-xxxx.onrender.com`.

The blueprint sets `DATA_DIR=/var/data` via the mounted disk so `trips.xlsx` survives redeploys.

### Option B — Manual Web Service

| Setting | Value |
|--------|--------|
| **Root directory** | *(repo root)* |
| **Runtime** | Node |
| **Build command** | `npm install && npm run install:all && npm run build` |
| **Start command** | `npm start` |
| **Node version** | 20 (Environment → `NODE_VERSION=20`) |

**Persistent data (important):** Without a disk, `trips.xlsx` is wiped on every deploy/restart.

1. **Disks** → Add disk, mount path `/var/data`, size 1 GB.
2. **Environment** → add `DATA_DIR` = `/var/data`.

### After deploy

- Open the Render URL → create a trip → share `/trip/<code>` with your group.
- Free tier services **spin down** after idle; the first visit may take ~30s to wake up.

### Troubleshooting

- **Build fails on `tsc`:** ensure build uses `npm run install:all` so devDependencies install.
- **Blank page / 404:** confirm the build step completed and `client/dist` exists in the image.
- **Data lost:** attach a disk and set `DATA_DIR=/var/data`.
