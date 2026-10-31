# SubscriptIQ — React + Express

A React/Vite frontend for the SubscriptIQ subscription-management hackathon MVP, backed by Express and SQLite.

## Stack

- React 18 + Vite
- Lucide React icons
- Node.js + Express API
- SQLite (`better-sqlite3`)
- Express sessions and bcrypt password hashing

## Requirements

Node.js 20 or newer and npm.

## Setup

1. Extract the project and open this directory in a terminal.
2. Install packages:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and set a long random `SESSION_SECRET`.
4. For development, run both the API and React dev server:
   ```bash
   npm run dev
   ```
   React runs at `http://localhost:5173` and proxies `/api` to Express at `http://localhost:5000`.
5. For a single-server run:
   ```bash
   npm run build
   npm start
   ```
   Then open `http://localhost:5000`.

## Demo accounts

- Admin: `admin@subscriptiq.demo` / `Admin@12345!`
- Staff: `staff@subscriptiq.demo` / `Staff@12345!`
- Customer: `customer@subscriptiq.demo` / `Customer@12345!`

Demo credentials are for local testing only. Change them before deployment.

## Main screens

- Overview dashboard and live summary metrics
- Products and plans
- Subscriptions (including close action)
- Invoices and payments
- Quotations (convert to subscription)
- Discounts
- Customers
- Reports
- Tax settings

Data tables and dashboard metrics request the Express API. Empty tables are shown when the local database has no records; the revenue chart in the overview is an illustrative UI visualization and should not be treated as financial reporting data. The Reports screen uses the backend summary endpoint.

## Git collaboration

```bash
git init
git add .
git commit -m "Create SubscriptIQ React application"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

Each teammate should create a branch (e.g. `feature/react-dashboard`, `feature/billing-ui`, `feature/testing-docs`), push it, and open a pull request. Avoid committing `.env`, `node_modules`, database files, or secrets.

## Before a public deployment

Set secure environment variables, use persistent session storage, enable HTTPS, configure secure cookie settings, add CSRF protection and rate limiting, review authorization for every endpoint, configure backups, and integrate a real payment provider only with its official server-side verification flow.

## Login UI

The sign-in screen uses a responsive two-column layout on desktop and a simplified single-column layout on mobile. It includes Google/GitHub OAuth buttons, email/password sign-in, show/hide password, an expandable demo-account helper, and clear OAuth error messages. Provider buttons require valid OAuth credentials in `.env`.

## Optional Google and GitHub OAuth login

Email/password login works without OAuth setup. To enable Google or GitHub login, add the corresponding client credentials to `.env`; leave a provider's credentials blank to keep that provider disabled.

### Google

1. Create an OAuth 2.0 Client ID in Google Cloud Console. Configure the OAuth consent screen and add your test users if the app is in testing mode.
2. Add this authorized redirect URI to the OAuth client: `http://localhost:5000/api/auth/google/callback`.
3. Copy the client ID and client secret into `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### GitHub

1. Open GitHub Settings → Developer settings → OAuth Apps → New OAuth App.
2. Set Homepage URL to `http://localhost:5000` and Authorization callback URL to `http://localhost:5000/api/auth/github/callback`.
3. Copy the client ID and client secret into `.env` as `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.

Restart `npm run dev` after changing `.env`. For production, register the exact HTTPS callback URLs for your deployed domain and set `GOOGLE_CALLBACK_URL` / `GITHUB_CALLBACK_URL` accordingly. Never commit `.env` or publish OAuth client secrets. New OAuth accounts are assigned the `customer` role; matching existing email addresses sign into the existing account. For GitHub, the user may need to make an email visible/available to the OAuth app.
