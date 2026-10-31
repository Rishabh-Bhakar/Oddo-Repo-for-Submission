# SubscriptIQ

SubscriptIQ is a web-based subscription management platform designed to manage subscription plans, customers, subscriptions, billing, and payment records through a centralized interface.

## Functionalities

- **User Authentication:** Log in using supported authentication methods.
- **Google Login:** Sign in using a Google account.
- **GitHub Login:** Sign in using a GitHub account.
- **Role-Based Access:** Separate interfaces for administrators, staff, and customers, according to the implemented permissions.
- **Dashboard:** Access subscription management features from a centralized interface.
- **Product and Plan Management:** Manage subscription products and plans.
- **Customer Management:** Organize customer information.
- **Subscription Management:** Manage customer subscription records.
- **Billing and Invoices:** Handle subscription-related billing information.
- **Payment Records:** View and manage payment-related information.

## Tech Stack

- React
- Vite
- Node.js
- Express.js
- SQLite
- JavaScript

## How to Run the Project on Any Laptop

### Prerequisites

Install:
- [Node.js and npm](https://nodejs.org/)
- [Git](https://git-scm.com/)
- A code editor such as Visual Studio Code (optional)

### Step 1: Clone the repository

Open a terminal and run:

```bash
git clone https://github.com/Rishabh-Bhakar/Oddo-Repo-for-Submission.git
```

### Step 2: Open the project directory

```bash
cd Oddo-Repo-for-Submission/subscriptiq-tier3
```

### Step 3: Install dependencies

```bash
npm install
```

### Step 4: Configure environment variables

Create a `.env` file inside the `subscriptiq-tier3` directory:

```env
PORT=5000
SESSION_SECRET=replace-with-a-long-random-secret
NODE_ENV=development

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_CALLBACK_URL=http://localhost:5000/api/auth/github/callback

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

Replace the session secret with a strong random value.

Google and GitHub login require valid OAuth credentials. Configure their callback URLs for the laptop's local development environment. SMTP settings are optional unless email functionality requires them.

### Step 5: Start the application

Run:

```bash
npm run dev
```

This starts the frontend and backend development servers.

### Step 6: Open the application

Open your browser and visit:

- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:5000

The frontend communicates with the backend through the configured Vite API proxy.

### Important Notes

- Ensure ports `5173` and `5000` are available.
- Keep `.env` private and never upload it to GitHub.
- The SQLite database is created or accessed by the backend. If the original database is not included in the repository, the application may start with an empty database; required tables and demo data depend on the backend implementation.
- Google and GitHub OAuth applications must be configured correctly for login to work.
- Run `npm run build` to build the frontend for production.
