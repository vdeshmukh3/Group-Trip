# Group Trip — expense splitter

Create a group trip, add people, log expenses (who paid, who the expense is split with), and see balances plus who should pay whom.

## Quick start

```bash
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..
```

Set `DATABASE_URL` to a PostgreSQL connection string, then start the app:

```bash
npm run dev
```

- **App:** http://localhost:5173  
- **API:** http://localhost:3001  

Share the trip page URL or trip code so others can open the same trip and add expenses.

## Data storage

Trip data is stored in PostgreSQL through `DATABASE_URL`. On startup, the app creates
the required tables. If the database has no trips and `server/data/trips.xlsx` exists,
the app imports the workbook's Trips, Members, Expenses, and ExpenseSplits sheets.
The workbook is left unchanged as a backup.

To import the local workbook into a newly created Render database, set the Render
database's **External Database URL** as `DATABASE_URL` in your local environment and
run `npm run migrate --prefix server` before adding trips in the deployed app. The
external URL is a secret; do not commit it to the repository.

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
3. Connect the repo; Render reads `render.yaml` and creates a free web service plus a free Postgres database.
4. Deploy. Your app URL will look like `https://group-trip-xxxx.onrender.com`.

The Blueprint connects the service to Postgres through `DATABASE_URL`.

### Option B — Manual Web Service

| Setting | Value |
|--------|--------|
| **Root directory** | *(repo root)* |
| **Runtime** | Node |
| **Build command** | `npm install && npm run install:all && npm run build` |
| **Start command** | `npm start` |
| **Node version** | 20 (Environment → `NODE_VERSION=20`) |

For a manual setup, create a Render Postgres database and add its **Internal Database URL** to the web service as `DATABASE_URL`.

**Free Postgres limits:** Render's free database has 1 GB storage, no backups, and expires 30 days after creation. Upgrade it before expiration if you need to keep the data longer.

### After deploy

- Open the Render URL → create a trip → share `/trip/<code>` with your group.
- Free tier services **spin down** after idle; the first visit may take ~30s to wake up.

### Troubleshooting

- **Build fails on `tsc`:** ensure build uses `npm run install:all` so devDependencies install.
- **Blank page / 404:** confirm the build step completed and `client/dist` exists in the image.
- **Database connection fails:** confirm `DATABASE_URL` is set to the Postgres database's Internal Database URL.
