require("dotenv").config();

const express = require("express");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const GitHubStrategy = require("passport-github2").Strategy;
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
let nodemailer;
try {
  nodemailer = require("nodemailer");
} catch (_) {
  nodemailer = null;
}

const app = express();
const PORT = Number(process.env.PORT || 5000);
const isProduction = process.env.NODE_ENV === "production";

if (
  isProduction &&
  (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
) {
  throw new Error(
    "Set SESSION_SECRET to a random value of at least 32 characters in production.",
  );
}

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "subscriptiq.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','staff','customer')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,
  interval TEXT NOT NULL CHECK(interval IN ('daily','weekly','monthly','yearly')),
  price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_number TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 10000),
  unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents >= 0),
  status TEXT NOT NULL CHECK(status IN ('active','closed')),
  start_date TEXT NOT NULL,
  next_billing_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL UNIQUE,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
  customer_id INTEGER NOT NULL REFERENCES users(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  tax_rate REAL NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  amount_paid_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('draft','confirmed','paid','overdue','cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(subscription_id, period_start)
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  method TEXT NOT NULL CHECK(method IN ('cash','bank_transfer','upi','card','other')),
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  payment_date TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  recorded_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

// Tier 2 schema additions. CREATE IF NOT EXISTS keeps upgrades safe for existing Tier 1 databases.
db.exec(`
CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,
  price_delta_cents INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, name)
);
CREATE TABLE IF NOT EXISTS tax_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  tax_name TEXT NOT NULL DEFAULT 'GST',
  rate REAL NOT NULL DEFAULT 0 CHECK(rate >= 0 AND rate <= 100),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO tax_settings(id,tax_name,rate) VALUES(1,'GST',18);
CREATE TABLE IF NOT EXISTS discount_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('percentage','fixed')),
  value REAL NOT NULL CHECK(value > 0),
  min_quantity INTEGER NOT NULL DEFAULT 1 CHECK(min_quantity >= 1),
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK(max_uses >= 1),
  uses INTEGER NOT NULL DEFAULT 0 CHECK(uses >= 0),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_number TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 10000),
  unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents >= 0),
  valid_until TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','sent','accepted','expired','converted')) DEFAULT 'draft',
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);
// Additive migrations for Tier 4-compatible billing fields. Existing local databases remain usable.
const columns = (table) =>
  new Set(
    db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((c) => c.name),
  );
if (!columns("subscriptions").has("discount_id"))
  db.exec("ALTER TABLE subscriptions ADD COLUMN discount_id INTEGER");
if (!columns("subscriptions").has("variant_id"))
  db.exec("ALTER TABLE subscriptions ADD COLUMN variant_id INTEGER");
if (!columns("invoices").has("discount_cents"))
  db.exec(
    "ALTER TABLE invoices ADD COLUMN discount_cents INTEGER NOT NULL DEFAULT 0",
  );
if (!columns("invoices").has("discount_rule_id"))
  db.exec("ALTER TABLE invoices ADD COLUMN discount_rule_id INTEGER");

function seed() {
  const count = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  if (count > 0) return;
  const insertUser = db.prepare(
    "INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)",
  );
  const seedTx = db.transaction(() => {
    insertUser.run(
      "System Admin",
      "admin@subscriptiq.demo",
      bcrypt.hashSync("Admin@12345!", 10),
      "admin",
    );
    insertUser.run(
      "Billing Staff",
      "staff@subscriptiq.demo",
      bcrypt.hashSync("Staff@12345!", 10),
      "staff",
    );
    insertUser.run(
      "Demo Customer",
      "customer@subscriptiq.demo",
      bcrypt.hashSync("Customer@12345!", 10),
      "customer",
    );

    const p = db.prepare(
      "INSERT INTO products (name,description) VALUES (?,?)",
    );
    const productId = Number(
      p.run("Brightloop Business Suite", "Core tools for growing businesses.")
        .lastInsertRowid,
    );
    const plan = db.prepare(
      "INSERT INTO plans (product_id,name,interval,price_cents) VALUES (?,?,?,?)",
    );
    const monthly = Number(
      plan.run(productId, "Monthly", "monthly", 99900).lastInsertRowid,
    );
    plan.run(productId, "Yearly", "yearly", 999900);

    const subNo = "SUB-DEMO-0001";
    const today = new Date();
    const dateStr = (d) => d.toISOString().slice(0, 10);
    const next = new Date(today);
    next.setMonth(next.getMonth() + 1);
    const start = dateStr(today);
    const nextDate = dateStr(next);
    const sid = Number(
      db
        .prepare(
          `INSERT INTO subscriptions
      (subscription_number,customer_id,plan_id,quantity,unit_price_cents,status,start_date,next_billing_date)
      VALUES (?,?,?,?,?,'active',?,?)`,
        )
        .run(subNo, 3, monthly, 1, 99900, start, nextDate).lastInsertRowid,
    );
    const periodEnd = dateStr(next);
    const invoiceNo = "INV-DEMO-0001";
    db.prepare(
      `INSERT INTO invoices
      (invoice_number,subscription_id,customer_id,period_start,period_end,subtotal_cents,tax_rate,tax_cents,total_cents,status)
      VALUES (?,?,?,?,?,?,0,0,?,'confirmed')`,
    ).run(invoiceNo, sid, 3, start, periodEnd, 99900, 99900);
  });
  seedTx();
}
seed();

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "100kb" }));
app.use(
  session({
    name: "subscriptiq.sid",
    secret: process.env.SESSION_SECRET || "local-demo-only-change-this-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);
app.use(express.static(path.join(__dirname, "dist")));
app.use(express.static(path.join(__dirname, "public")));
app.use(passport.initialize());

// OAuth accounts are created as customer accounts. Existing users are matched by email.
function findOrCreateOAuthUser(profile, provider, done) {
  try {
    const email = String(
      profile.emails?.find((e) => e.value && e.verified === true)?.value || "",
    )
      .trim()
      .toLowerCase();
    const name = String(
      profile.displayName ||
        profile.username ||
        email.split("@")[0] ||
        "SubscriptIQ user",
    )
      .trim()
      .slice(0, 100);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return done(null, false, {
        message: `Your ${provider} account did not provide a verified email address. Verify your email, allow email access, and try again.`,
      });
    }
    let user = db
      .prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE")
      .get(email);
    if (!user) {
      // The password hash is never used for OAuth sign-in; random bytes prevent password login.
      const randomHash = bcrypt.hashSync(
        crypto.randomBytes(32).toString("hex"),
        10,
      );
      const result = db
        .prepare(
          "INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'customer')",
        )
        .run(name || "SubscriptIQ user", email, randomHash);
      user = db
        .prepare("SELECT * FROM users WHERE id = ?")
        .get(Number(result.lastInsertRowid));
    }
    return done(null, safeUser(user));
  } catch (error) {
    if (String(error.code || "").includes("SQLITE_CONSTRAINT_UNIQUE")) {
      const user = db
        .prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE")
        .get(
          String(
            profile.emails?.find((e) => e.value && e.verified === true)
              ?.value || "",
          ).toLowerCase(),
        );
      if (user) return done(null, safeUser(user));
    }
    return done(error);
  }
}

const googleCallbackURL =
  process.env.GOOGLE_CALLBACK_URL ||
  `http://localhost:${PORT}/api/auth/google/callback`;
const githubCallbackURL =
  process.env.GITHUB_CALLBACK_URL ||
  `http://localhost:${PORT}/api/auth/github/callback`;
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    "google",
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: googleCallbackURL,
      },
      (accessToken, refreshToken, profile, done) =>
        findOrCreateOAuthUser(profile, "Google", done),
    ),
  );
}
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(
    "github",
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: githubCallbackURL,
        scope: ["user:email"],
      },
      (accessToken, refreshToken, profile, done) =>
        findOrCreateOAuthUser(profile, "GitHub", done),
    ),
  );
}

const safeUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
});
function requireAuth(req, res, next) {
  if (!req.session.user)
    return res.status(401).json({ error: "Please sign in first." });
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user)
      return res.status(401).json({ error: "Please sign in first." });
    if (!roles.includes(req.session.user.role))
      return res
        .status(403)
        .json({ error: "You do not have permission to do this." });
    next();
  };
}
function text(value, max = 120) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}
function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}
function addInterval(dateString, interval) {
  const d = new Date(`${dateString}T12:00:00Z`);
  if (interval === "daily") d.setUTCDate(d.getUTCDate() + 1);
  else if (interval === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else if (interval === "yearly") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}
function nextNumber(prefix, table, column) {
  const n = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n + 1;
  return `${prefix}-${String(n).padStart(5, "0")}`;
}
function moneyToCents(value) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100000000
  )
    return null;
  return Math.round(value * 100);
}
function invoiceForSubscription(subscriptionId, periodStart, periodEnd) {
  const sub = db
    .prepare(
      `
    SELECT s.*, p.interval, p.name AS plan_name, pr.name AS product_name
    FROM subscriptions s JOIN plans p ON p.id=s.plan_id JOIN products pr ON pr.id=p.product_id
    WHERE s.id=?
  `,
    )
    .get(subscriptionId);
  if (!sub) throw new Error("Subscription not found.");
  const existing = db
    .prepare(
      "SELECT id FROM invoices WHERE subscription_id=? AND period_start=?",
    )
    .get(subscriptionId, periodStart);
  if (existing) return existing.id;
  const subtotal = sub.unit_price_cents * sub.quantity;
  const taxSetting = db
    .prepare("SELECT rate FROM tax_settings WHERE id=1")
    .get();
  const taxRate = taxSetting ? taxSetting.rate : 0;
  let discountCents = 0,
    discountRuleId = null;
  if (sub.discount_id) {
    const rule = db
      .prepare("SELECT * FROM discount_rules WHERE id=? AND active=1")
      .get(sub.discount_id);
    const invoiceDate = periodStart;
    if (
      rule &&
      invoiceDate >= rule.starts_on &&
      invoiceDate <= rule.ends_on &&
      rule.uses < rule.max_uses &&
      sub.quantity >= rule.min_quantity
    ) {
      discountRuleId = rule.id;
      discountCents = Math.min(
        subtotal,
        rule.kind === "percentage"
          ? Math.round((subtotal * rule.value) / 100)
          : Math.round(rule.value * 100),
      );
    }
  }
  const taxable = Math.max(0, subtotal - discountCents);
  const tax = Math.round((taxable * taxRate) / 100);
  const total = taxable + tax;
  const invoiceNumber = nextNumber("INV", "invoices", "invoice_number");
  const result = db
    .prepare(
      `
    INSERT INTO invoices
      (invoice_number,subscription_id,customer_id,period_start,period_end,subtotal_cents,discount_cents,discount_rule_id,tax_rate,tax_cents,total_cents,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'confirmed')
  `,
    )
    .run(
      invoiceNumber,
      subscriptionId,
      sub.customer_id,
      periodStart,
      periodEnd,
      subtotal,
      discountCents,
      discountRuleId,
      taxRate,
      tax,
      total,
    );
  if (discountRuleId)
    db.prepare(
      "UPDATE discount_rules SET uses=uses+1,active=CASE WHEN uses+1>=max_uses THEN 0 ELSE active END WHERE id=? AND uses<max_uses",
    ).run(discountRuleId);
  return Number(result.lastInsertRowid);
}

function passwordIsStrong(password) {
  return (
    typeof password === "string" &&
    password.length >= 9 &&
    password.length <= 200 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}
app.post("/api/auth/register", (req, res) => {
  const name = text(req.body?.name, 100),
    email = text(req.body?.email, 254).toLowerCase(),
    password = req.body?.password;
  if (
    name.length < 2 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !passwordIsStrong(password)
  )
    return res
      .status(400)
      .json({
        error:
          "Enter a name, valid email, and password with at least 9 characters including uppercase, lowercase and a special character.",
      });
  try {
    const result = db
      .prepare(
        "INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'customer')",
      )
      .run(name, email, bcrypt.hashSync(password, 10));
    res
      .status(201)
      .json({
        success: true,
        userId: Number(result.lastInsertRowid),
        message: "Account created. You can now sign in.",
      });
  } catch (e) {
    if (String(e.code).includes("SQLITE_CONSTRAINT_UNIQUE"))
      return res
        .status(409)
        .json({ error: "An account with this email already exists." });
    throw e;
  }
});
app.post("/api/auth/forgot-password", async (req, res) => {
  const email = text(req.body?.email, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: "Enter a valid email address." });
  const user = db
    .prepare("SELECT id,email FROM users WHERE email=?")
    .get(email);
  // Do not reveal whether an email is registered.
  if (user) {
    const raw = crypto.randomBytes(32).toString("hex"),
      hash = crypto.createHash("sha256").update(raw).digest("hex"),
      expires = Date.now() + 30 * 60 * 1000;
    db.prepare(
      "INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES(?,?,?)",
    ).run(user.id, hash, expires);
    const base = (process.env.APP_URL || `http://localhost:${PORT}`).replace(
      /\/$/,
      "",
    );
    const link = `${base}/?reset=${raw}`;
    if (
      nodemailer &&
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
    ) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: process.env.SMTP_SECURE === "true",
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: user.email,
          subject: "Reset your SubscriptIQ password",
          text: `This link expires in 30 minutes: ${link}`,
        });
      } catch (err) {
        console.error("Password reset email failed:", err.message);
      }
    } else if (!isProduction)
      console.log(`[DEV PASSWORD RESET] ${user.email}: ${link}`);
  }
  res.json({
    success: true,
    message:
      "If the account exists, password reset instructions will be sent to its registered email.",
  });
});
app.post("/api/auth/reset-password", (req, res) => {
  const token = text(req.body?.token, 128),
    password = req.body?.password;
  if (!token || !passwordIsStrong(password))
    return res
      .status(400)
      .json({
        error:
          "Provide a valid reset token and a password with at least 9 characters including uppercase, lowercase and a special character.",
      });
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const row = db
    .prepare(
      "SELECT * FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>? ORDER BY id DESC LIMIT 1",
    )
    .get(hash, Date.now());
  if (!row)
    return res
      .status(400)
      .json({
        error: "This reset link is invalid or expired. Request a new one.",
      });
  const tx = db.transaction(() => {
    db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(
      bcrypt.hashSync(password, 10),
      row.user_id,
    );
    db.prepare("UPDATE password_reset_tokens SET used_at=? WHERE id=?").run(
      Date.now(),
      row.id,
    );
  });
  tx();
  res.json({
    success: true,
    message: "Password updated. Sign in with your new password.",
  });
});

function finishOAuth(req, res, user, provider) {
  if (!user)
    return res.redirect(
      `/?oauth_error=${encodeURIComponent(provider + " sign-in failed. Check that your provider account shares an email and try again.")}`,
    );
  req.session.regenerate((err) => {
    if (err)
      return res.redirect(
        `/?oauth_error=${encodeURIComponent("Unable to start a secure session. Please try again.")}`,
      );
    req.session.user = user;
    req.session.save((saveErr) => {
      if (saveErr)
        return res.redirect(
          `/?oauth_error=${encodeURIComponent("Unable to save your session. Please try again.")}`,
        );
      res.redirect("/");
    });
  });
}
app.get("/api/auth/google", (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)
    return res
      .status(503)
      .send(
        "Google login is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.",
      );
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })(req, res, next);
});
app.get("/api/auth/google/callback", (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)
    return res.redirect("/?oauth_error=Google%20login%20is%20not%20configured");
  passport.authenticate("google", { session: false }, (err, user) => {
    if (err) return next(err);
    finishOAuth(req, res, user, "Google");
  })(req, res, next);
});
app.get("/api/auth/github", (req, res, next) => {
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET)
    return res
      .status(503)
      .send(
        "GitHub login is not configured. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to .env.",
      );
  passport.authenticate("github", { scope: ["user:email"], session: false })(
    req,
    res,
    next,
  );
});
app.get("/api/auth/github/callback", (req, res, next) => {
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET)
    return res.redirect("/?oauth_error=GitHub%20login%20is%20not%20configured");
  passport.authenticate("github", { session: false }, (err, user) => {
    if (err) return next(err);
    finishOAuth(req, res, user, "GitHub");
  })(req, res, next);
});

app.post("/api/auth/login", (req, res) => {
  const email = text(req.body?.email, 254).toLowerCase();
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";
  if (
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < 1 ||
    password.length > 200
  ) {
    return res.status(400).json({ error: "Enter a valid email and password." });
  }
  const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  req.session.user = safeUser(user);
  res.json({ user: req.session.user });
});
app.post("/api/auth/logout", (req, res) => {
  if (!req.session) {
    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  }

  req.session.destroy((error) => {
    if (error) {
      console.error("Logout error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to log out",
      });
    }

    res.clearCookie("connect.sid", {
      path: "/",
    });

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  });
});
app.get("/api/auth/me", (req, res) =>
  res.json({ user: req.session.user || null }),
);

app.get("/api/dashboard", requireAuth, (req, res) => {
  const user = req.session.user;
  // Keep separate, straightforward queries to avoid ambiguous aggregate joins.
  const active =
    user.role === "customer"
      ? db
          .prepare(
            "SELECT COUNT(*) n FROM subscriptions WHERE customer_id=? AND status='active'",
          )
          .get(user.id).n
      : db
          .prepare("SELECT COUNT(*) n FROM subscriptions WHERE status='active'")
          .get().n;
  const invWhere = user.role === "customer" ? " WHERE customer_id=?" : "";
  const invParams = user.role === "customer" ? [user.id] : [];
  const collected = db
    .prepare(
      `SELECT COALESCE(SUM(amount_paid_cents),0) n FROM invoices${invWhere}`,
    )
    .get(...invParams).n;
  const outstanding = db
    .prepare(
      `SELECT COALESCE(SUM(total_cents-amount_paid_cents),0) n FROM invoices${invWhere}${invWhere ? " AND" : " WHERE"} status IN ('confirmed','overdue')`,
    )
    .get(...invParams).n;
  const overdue = db
    .prepare(
      `SELECT COUNT(*) n FROM invoices${invWhere}${invWhere ? " AND" : " WHERE"} (status='overdue' OR (status='confirmed' AND period_end<? AND amount_paid_cents<total_cents))`,
    )
    .get(...invParams, new Date().toISOString().slice(0, 10)).n;
  const recentPayments =
    user.role === "customer"
      ? db
          .prepare(
            `SELECT pay.*, i.invoice_number FROM payments pay JOIN invoices i ON i.id=pay.invoice_id WHERE i.customer_id=? ORDER BY pay.payment_date DESC, pay.id DESC LIMIT 5`,
          )
          .all(user.id)
      : db
          .prepare(
            `SELECT pay.*, i.invoice_number FROM payments pay JOIN invoices i ON i.id=pay.invoice_id ORDER BY pay.payment_date DESC, pay.id DESC LIMIT 5`,
          )
          .all();
  res.json({
    activeSubscriptions: active,
    revenueCollectedCents: collected,
    outstandingCents: outstanding,
    overdueInvoices: overdue,
    recentPayments,
  });
});

app.get("/api/products", requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `
    SELECT pr.*, COUNT(pl.id) AS plan_count FROM products pr
    LEFT JOIN plans pl ON pl.product_id=pr.id AND pl.active=1
    GROUP BY pr.id ORDER BY pr.id DESC
  `,
    )
    .all();
  res.json({ data: rows });
});
app.post("/api/products", requireRole("admin"), (req, res) => {
  const name = text(req.body?.name, 100);
  const description = text(req.body?.description, 500);
  if (name.length < 2)
    return res
      .status(400)
      .json({ error: "Product name must be at least 2 characters." });
  const result = db
    .prepare("INSERT INTO products(name,description) VALUES(?,?)")
    .run(name, description);
  res
    .status(201)
    .json({ id: Number(result.lastInsertRowid), name, description });
});
app.get("/api/plans", requireAuth, (req, res) => {
  const data = db
    .prepare(
      `
    SELECT pl.*, pr.name AS product_name FROM plans pl JOIN products pr ON pr.id=pl.product_id
    WHERE pl.active=1 AND pr.active=1 ORDER BY pl.id DESC
  `,
    )
    .all();
  res.json({ data });
});
app.post("/api/plans", requireRole("admin"), (req, res) => {
  const productId = Number(req.body?.productId);
  const name = text(req.body?.name, 80);
  const interval = req.body?.interval;
  const priceCents = moneyToCents(req.body?.price);
  if (!Number.isInteger(productId) || productId < 1)
    return res.status(400).json({ error: "Select a valid product." });
  if (name.length < 2)
    return res
      .status(400)
      .json({ error: "Plan name must be at least 2 characters." });
  if (!["daily", "weekly", "monthly", "yearly"].includes(interval))
    return res
      .status(400)
      .json({
        error: "Billing cycle must be daily, weekly, monthly or yearly.",
      });
  if (priceCents === null)
    return res.status(400).json({ error: "Enter a valid non-negative price." });
  const product = db
    .prepare("SELECT id FROM products WHERE id=? AND active=1")
    .get(productId);
  if (!product)
    return res.status(400).json({ error: "Selected product is unavailable." });
  const result = db
    .prepare(
      "INSERT INTO plans(product_id,name,interval,price_cents) VALUES(?,?,?,?)",
    )
    .run(productId, name, interval, priceCents);
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

app.get("/api/staff", requireRole("admin"), (req, res) =>
  res.json({
    data: db
      .prepare(
        "SELECT id,name,email,created_at FROM users WHERE role='staff' ORDER BY name",
      )
      .all(),
  }),
);
app.post("/api/staff", requireRole("admin"), (req, res) => {
  const name = text(req.body?.name, 100),
    email = text(req.body?.email, 254).toLowerCase(),
    password = req.body?.password;
  if (
    name.length < 2 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !passwordIsStrong(password)
  )
    return res
      .status(400)
      .json({
        error:
          "Enter a name, valid email, and strong password (9+ characters with uppercase, lowercase and special character).",
      });
  try {
    const r = db
      .prepare(
        "INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'staff')",
      )
      .run(name, email, bcrypt.hashSync(password, 10));
    res
      .status(201)
      .json({ id: Number(r.lastInsertRowid), name, email, role: "staff" });
  } catch (e) {
    if (String(e.code).includes("SQLITE_CONSTRAINT_UNIQUE"))
      return res.status(409).json({ error: "That email already exists." });
    throw e;
  }
});

app.get("/api/customers", requireRole("admin", "staff"), (req, res) => {
  const data = db
    .prepare(
      "SELECT id,name,email FROM users WHERE role='customer' ORDER BY name",
    )
    .all();
  res.json({ data });
});

app.get("/api/subscriptions", requireAuth, (req, res) => {
  const customer = req.session.user.role === "customer";
  const data = db
    .prepare(
      `
    SELECT s.*, u.name AS customer_name, u.email AS customer_email,
           pl.name AS plan_name, pl.interval, pr.name AS product_name
    FROM subscriptions s JOIN users u ON u.id=s.customer_id
    JOIN plans pl ON pl.id=s.plan_id JOIN products pr ON pr.id=pl.product_id
    ${customer ? "WHERE s.customer_id=?" : ""}
    ORDER BY s.id DESC
  `,
    )
    .all(...(customer ? [req.session.user.id] : []));
  res.json({ data });
});
app.post(
  "/api/subscriptions",
  requireRole("admin", "staff", "customer"),
  (req, res) => {
    const user = req.session.user;
    const planId = Number(req.body?.planId);
    const quantity = Number(req.body?.quantity);
    const customerId =
      user.role === "customer" ? user.id : Number(req.body?.customerId);
    const startDate = req.body?.startDate;
    const discountId = req.body?.discountId
      ? Number(req.body.discountId)
      : null;
    const variantId = req.body?.variantId ? Number(req.body.variantId) : null;
    if (!Number.isInteger(planId) || planId < 1)
      return res.status(400).json({ error: "Select a valid plan." });
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000)
      return res
        .status(400)
        .json({ error: "Quantity must be between 1 and 10,000." });
    if (!Number.isInteger(customerId) || customerId < 1)
      return res.status(400).json({ error: "Select a valid customer." });
    if (!validDate(startDate))
      return res.status(400).json({ error: "Enter a valid start date." });
    const customer = db
      .prepare("SELECT id FROM users WHERE id=? AND role='customer'")
      .get(customerId);
    const plan = db
      .prepare(
        "SELECT pl.*, pr.active AS product_active FROM plans pl JOIN products pr ON pr.id=pl.product_id WHERE pl.id=? AND pl.active=1",
      )
      .get(planId);
    if (!customer)
      return res.status(400).json({ error: "Customer not found." });
    if (!plan || !plan.product_active)
      return res.status(400).json({ error: "Plan is unavailable." });
    let variantDelta = 0;
    if (variantId !== null) {
      if (!Number.isInteger(variantId) || variantId < 1)
        return res.status(400).json({ error: "Invalid product variant." });
      const variant = db
        .prepare(
          "SELECT id,product_id,price_delta_cents FROM product_variants WHERE id=? AND active=1",
        )
        .get(variantId);
      if (!variant || variant.product_id !== plan.product_id)
        return res
          .status(400)
          .json({ error: "Variant does not belong to the selected product." });
      variantDelta = variant.price_delta_cents;
    }
    if (discountId !== null) {
      if (!Number.isInteger(discountId) || discountId < 1)
        return res.status(400).json({ error: "Invalid discount rule." });
      const rule = db
        .prepare("SELECT * FROM discount_rules WHERE id=? AND active=1")
        .get(discountId);
      const today = startDate;
      if (
        !rule ||
        today < rule.starts_on ||
        today > rule.ends_on ||
        rule.uses >= rule.max_uses ||
        quantity < rule.min_quantity
      )
        return res
          .status(400)
          .json({
            error:
              "Discount rule is not valid for this subscription date or quantity.",
          });
    }
    const nextDate = addInterval(startDate, plan.interval);
    const subscriptionNumber = nextNumber(
      "SUB",
      "subscriptions",
      "subscription_number",
    );
    const create = db.transaction(() => {
      const result = db
        .prepare(
          `
      INSERT INTO subscriptions(subscription_number,customer_id,plan_id,quantity,unit_price_cents,status,start_date,next_billing_date,discount_id,variant_id)
      VALUES(?,?,?,?,?,'active',?,?,?,?)
    `,
        )
        .run(
          subscriptionNumber,
          customerId,
          planId,
          quantity,
          plan.price_cents + variantDelta,
          startDate,
          nextDate,
          discountId,
          variantId,
        );
      const id = Number(result.lastInsertRowid);
      const invoiceId = invoiceForSubscription(id, startDate, nextDate);
      return { id, invoiceId };
    });
    try {
      const result = create();
      res.status(201).json({ success: true, ...result, subscriptionNumber });
    } catch (e) {
      console.error(e);
      res
        .status(500)
        .json({ error: "Could not create subscription and invoice." });
    }
  },
);

app.patch(
  "/api/subscriptions/:id/close",
  requireRole("admin", "staff"),
  (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1)
      return res.status(400).json({ error: "Invalid subscription ID." });
    const result = db
      .prepare(
        "UPDATE subscriptions SET status='closed' WHERE id=? AND status='active'",
      )
      .run(id);
    if (!result.changes)
      return res.status(404).json({ error: "Active subscription not found." });
    res.json({ success: true });
  },
);

app.get("/api/invoices", requireAuth, (req, res) => {
  const customer = req.session.user.role === "customer";
  const data = db
    .prepare(
      `
    SELECT i.*, u.name AS customer_name, u.email AS customer_email, s.subscription_number,
           p.name AS plan_name, pr.name AS product_name
    FROM invoices i JOIN users u ON u.id=i.customer_id
    JOIN subscriptions s ON s.id=i.subscription_id
    JOIN plans p ON p.id=s.plan_id JOIN products pr ON pr.id=p.product_id
    ${customer ? "WHERE i.customer_id=?" : ""}
    ORDER BY i.id DESC
  `,
    )
    .all(...(customer ? [req.session.user.id] : []));
  res.json({ data });
});

app.post("/api/payments", requireRole("admin", "staff"), (req, res) => {
  const invoiceId = Number(req.body?.invoiceId);
  const method = req.body?.method;
  const amountCents = moneyToCents(req.body?.amount);
  const paymentDate = req.body?.paymentDate;
  const note = text(req.body?.note, 250);
  if (!Number.isInteger(invoiceId) || invoiceId < 1)
    return res.status(400).json({ error: "Select a valid invoice." });
  if (!["cash", "bank_transfer", "upi", "card", "other"].includes(method))
    return res.status(400).json({ error: "Select a valid payment method." });
  if (amountCents === null || amountCents <= 0)
    return res
      .status(400)
      .json({ error: "Payment amount must be greater than zero." });
  if (!validDate(paymentDate))
    return res.status(400).json({ error: "Enter a valid payment date." });
  const recordPayment = db.transaction(() => {
    const invoice = db
      .prepare("SELECT * FROM invoices WHERE id=?")
      .get(invoiceId);
    if (!invoice) throw new Error("Invoice not found.");
    if (invoice.status === "cancelled")
      throw new Error("Cancelled invoices cannot receive payments.");
    const balance = invoice.total_cents - invoice.amount_paid_cents;
    if (amountCents > balance)
      throw new Error("Payment cannot exceed the outstanding balance.");
    db.prepare(
      "INSERT INTO payments(invoice_id,method,amount_cents,payment_date,note,recorded_by) VALUES(?,?,?,?,?,?)",
    ).run(
      invoiceId,
      method,
      amountCents,
      paymentDate,
      note,
      req.session.user.id,
    );
    const paid = invoice.amount_paid_cents + amountCents;
    const status =
      paid >= invoice.total_cents
        ? "paid"
        : invoice.status === "overdue"
          ? "overdue"
          : "confirmed";
    db.prepare(
      "UPDATE invoices SET amount_paid_cents=?,status=? WHERE id=?",
    ).run(paid, status, invoiceId);
  });
  try {
    recordPayment();
    res.status(201).json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message || "Could not record payment." });
  }
});

app.get("/api/payments", requireRole("admin", "staff"), (req, res) => {
  const data = db
    .prepare(
      `
    SELECT pay.*, i.invoice_number, u.name AS customer_name
    FROM payments pay JOIN invoices i ON i.id=pay.invoice_id JOIN users u ON u.id=i.customer_id
    ORDER BY pay.payment_date DESC, pay.id DESC LIMIT 100
  `,
    )
    .all();
  res.json({ data });
});

// ---------------- Tier 2 APIs ----------------
// Product variants: price delta is added to the selected plan price when a quote/subscription is priced.
app.get("/api/variants", requireAuth, (req, res) => {
  const productId = req.query.productId ? Number(req.query.productId) : null;
  if (productId !== null && (!Number.isInteger(productId) || productId < 1))
    return res.status(400).json({ error: "Invalid product ID." });
  const rows =
    productId === null
      ? db
          .prepare(
            "SELECT v.*,p.name AS product_name FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.active=1 ORDER BY v.id DESC",
          )
          .all()
      : db
          .prepare(
            "SELECT v.*,p.name AS product_name FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.active=1 AND v.product_id=? ORDER BY v.id DESC",
          )
          .all(productId);
  res.json({ data: rows });
});
app.post("/api/variants", requireRole("admin"), (req, res) => {
  const productId = Number(req.body?.productId),
    name = text(req.body?.name, 80);
  const delta = moneyToCents(Number(req.body?.priceDelta ?? 0));
  if (!Number.isInteger(productId) || productId < 1)
    return res.status(400).json({ error: "Select a valid product." });
  if (name.length < 2)
    return res
      .status(400)
      .json({ error: "Variant name must be at least 2 characters." });
  if (delta === null)
    return res
      .status(400)
      .json({ error: "Price adjustment must be a non-negative number." });
  if (
    !db
      .prepare("SELECT id FROM products WHERE id=? AND active=1")
      .get(productId)
  )
    return res.status(404).json({ error: "Product not found." });
  try {
    const r = db
      .prepare(
        "INSERT INTO product_variants(product_id,name,price_delta_cents) VALUES(?,?,?)",
      )
      .run(productId, name, delta);
    res
      .status(201)
      .json({
        id: Number(r.lastInsertRowid),
        productId,
        name,
        priceDeltaCents: delta,
      });
  } catch {
    res
      .status(409)
      .json({
        error: "A variant with that name already exists for this product.",
      });
  }
});

app.get("/api/settings/tax", requireAuth, (req, res) =>
  res.json({
    data: db
      .prepare("SELECT tax_name AS name,rate FROM tax_settings WHERE id=1")
      .get(),
  }),
);
app.put("/api/settings/tax", requireRole("admin"), (req, res) => {
  const name = text(req.body?.name, 40),
    rate = Number(req.body?.rate);
  if (name.length < 2 || !Number.isFinite(rate) || rate < 0 || rate > 100)
    return res
      .status(400)
      .json({
        error: "Tax name is required and rate must be between 0 and 100.",
      });
  db.prepare(
    "UPDATE tax_settings SET tax_name=?,rate=?,updated_at=CURRENT_TIMESTAMP WHERE id=1",
  ).run(name, rate);
  res.json({ success: true, data: { name, rate } });
});

app.get("/api/discounts", requireRole("admin", "staff"), (req, res) =>
  res.json({
    data: db.prepare("SELECT * FROM discount_rules ORDER BY id DESC").all(),
  }),
);
app.post("/api/discounts", requireRole("admin"), (req, res) => {
  const name = text(req.body?.name, 100),
    kind = req.body?.kind,
    value = Number(req.body?.value);
  const minQuantity = Number(req.body?.minQuantity ?? 1),
    startsOn = req.body?.startsOn,
    endsOn = req.body?.endsOn,
    maxUses = Number(req.body?.maxUses ?? 1);
  if (
    name.length < 2 ||
    !["percentage", "fixed"].includes(kind) ||
    !Number.isFinite(value) ||
    value <= 0 ||
    (kind === "percentage" && value > 100)
  )
    return res
      .status(400)
      .json({ error: "Enter a valid discount name, type and value." });
  if (
    !Number.isInteger(minQuantity) ||
    minQuantity < 1 ||
    !Number.isInteger(maxUses) ||
    maxUses < 1 ||
    !validDate(startsOn) ||
    !validDate(endsOn) ||
    endsOn < startsOn
  )
    return res
      .status(400)
      .json({ error: "Check quantity, usage limit and date range." });
  const r = db
    .prepare(
      "INSERT INTO discount_rules(name,kind,value,min_quantity,starts_on,ends_on,max_uses) VALUES(?,?,?,?,?,?,?)",
    )
    .run(name, kind, value, minQuantity, startsOn, endsOn, maxUses);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});
app.post(
  "/api/discounts/:id/preview",
  requireRole("admin", "staff"),
  (req, res) => {
    const id = Number(req.params.id),
      quantity = Number(req.body?.quantity),
      subtotal = moneyToCents(Number(req.body?.subtotal));
    if (
      !Number.isInteger(id) ||
      id < 1 ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      subtotal === null
    )
      return res
        .status(400)
        .json({ error: "Invalid discount preview request." });
    const rule = db
        .prepare("SELECT * FROM discount_rules WHERE id=? AND active=1")
        .get(id),
      today = new Date().toISOString().slice(0, 10);
    if (
      !rule ||
      today < rule.starts_on ||
      today > rule.ends_on ||
      rule.uses >= rule.max_uses ||
      quantity < rule.min_quantity
    )
      return res
        .status(409)
        .json({
          error:
            "Discount is inactive, expired, exhausted or does not meet the minimum quantity.",
        });
    const discountCents = Math.min(
      subtotal,
      rule.kind === "percentage"
        ? Math.round((subtotal * rule.value) / 100)
        : Math.round(rule.value * 100),
    );
    res.json({
      discountCents,
      subtotalAfterDiscountCents: subtotal - discountCents,
      ruleName: rule.name,
    });
  },
);

app.post(
  "/api/discounts/:id/apply",
  requireRole("admin", "staff"),
  (req, res) => {
    const id = Number(req.params.id),
      quantity = Number(req.body?.quantity),
      subtotal = moneyToCents(Number(req.body?.subtotal));
    if (
      !Number.isInteger(id) ||
      id < 1 ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      subtotal === null
    )
      return res.status(400).json({ error: "Invalid discount request." });
    const rule = db
        .prepare("SELECT * FROM discount_rules WHERE id=? AND active=1")
        .get(id),
      today = new Date().toISOString().slice(0, 10);
    if (
      !rule ||
      today < rule.starts_on ||
      today > rule.ends_on ||
      rule.uses >= rule.max_uses ||
      quantity < rule.min_quantity
    )
      return res
        .status(409)
        .json({
          error:
            "Discount is inactive, expired, exhausted or does not meet the minimum quantity.",
        });
    const discountCents = Math.min(
      subtotal,
      rule.kind === "percentage"
        ? Math.round((subtotal * rule.value) / 100)
        : Math.round(rule.value * 100),
    );
    const update = db
      .prepare(
        "UPDATE discount_rules SET uses=uses+1,active=CASE WHEN uses+1>=max_uses THEN 0 ELSE active END WHERE id=? AND uses<max_uses",
      )
      .run(id);
    if (!update.changes)
      return res.status(409).json({ error: "Discount usage limit reached." });
    res.json({
      discountCents,
      subtotalAfterDiscountCents: subtotal - discountCents,
      ruleName: rule.name,
    });
  },
);

app.get("/api/quotes", requireAuth, (req, res) => {
  const customer = req.session.user.role === "customer";
  const data = db
    .prepare(
      `SELECT q.*,u.name AS customer_name,p.name AS plan_name,pr.name AS product_name FROM quotes q JOIN users u ON u.id=q.customer_id JOIN plans p ON p.id=q.plan_id JOIN products pr ON pr.id=p.product_id ${customer ? "WHERE q.customer_id=?" : ""} ORDER BY q.id DESC`,
    )
    .all(...(customer ? [req.session.user.id] : []));
  res.json({ data });
});
app.post("/api/quotes", requireRole("admin", "staff"), (req, res) => {
  const customerId = Number(req.body?.customerId),
    planId = Number(req.body?.planId),
    quantity = Number(req.body?.quantity),
    validDays = Number(req.body?.validDays ?? 7);
  if (
    !Number.isInteger(customerId) ||
    !Number.isInteger(planId) ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 10000 ||
    !Number.isInteger(validDays) ||
    validDays < 1 ||
    validDays > 90
  )
    return res
      .status(400)
      .json({
        error: "Choose a customer, plan, quantity and validity of 1–90 days.",
      });
  const customer = db
      .prepare("SELECT id FROM users WHERE id=? AND role='customer'")
      .get(customerId),
    plan = db
      .prepare(
        "SELECT pl.* FROM plans pl JOIN products pr ON pr.id=pl.product_id WHERE pl.id=? AND pl.active=1 AND pr.active=1",
      )
      .get(planId);
  if (!customer || !plan)
    return res.status(400).json({ error: "Customer or plan is unavailable." });
  const until = new Date();
  until.setUTCDate(until.getUTCDate() + validDays);
  const validUntil = until.toISOString().slice(0, 10),
    quoteNumber = nextNumber("QUO", "quotes", "quote_number");
  const r = db
    .prepare(
      "INSERT INTO quotes(quote_number,customer_id,plan_id,quantity,unit_price_cents,valid_until,status,created_by) VALUES(?,?,?,?,?,?,'sent',?)",
    )
    .run(
      quoteNumber,
      customerId,
      planId,
      quantity,
      plan.price_cents,
      validUntil,
      req.session.user.id,
    );
  res
    .status(201)
    .json({
      id: Number(r.lastInsertRowid),
      quoteNumber,
      validUntil,
      status: "sent",
    });
});
app.post(
  "/api/quotes/:id/convert",
  requireRole("admin", "staff"),
  (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1)
      return res.status(400).json({ error: "Invalid quote ID." });
    try {
      const convert = db.transaction(() => {
        const q = db.prepare("SELECT * FROM quotes WHERE id=?").get(id);
        if (!q) throw new Error("Quote not found.");
        if (q.status === "converted")
          throw new Error("Quote has already been converted.");
        if (
          q.status !== "sent" ||
          q.valid_until < new Date().toISOString().slice(0, 10)
        ) {
          db.prepare("UPDATE quotes SET status='expired' WHERE id=?").run(id);
          throw new Error("Quote is expired or not ready to convert.");
        }
        const plan = db
          .prepare("SELECT interval FROM plans WHERE id=?")
          .get(q.plan_id);
        const start = new Date().toISOString().slice(0, 10),
          next = addInterval(start, plan.interval),
          subNo = nextNumber("SUB", "subscriptions", "subscription_number");
        const sr = db
          .prepare(
            "INSERT INTO subscriptions(subscription_number,customer_id,plan_id,quantity,unit_price_cents,status,start_date,next_billing_date) VALUES(?,?,?,?,?,'active',?,?)",
          )
          .run(
            subNo,
            q.customer_id,
            q.plan_id,
            q.quantity,
            q.unit_price_cents,
            start,
            next,
          );
        const subscriptionId = Number(sr.lastInsertRowid),
          invoiceId = invoiceForSubscription(subscriptionId, start, next);
        db.prepare("UPDATE quotes SET status='converted' WHERE id=?").run(id);
        return { subscriptionId, invoiceId, subscriptionNumber: subNo };
      });
      res.status(201).json({ success: true, ...convert() });
    } catch (e) {
      res.status(400).json({ error: e.message || "Could not convert quote." });
    }
  },
);

// Run this endpoint manually on demo day to process subscriptions due today or earlier.
// Unique(subscription_id, period_start) prevents duplicate invoices on repeated runs.
app.post("/api/billing/run-due", requireRole("admin", "staff"), (req, res) => {
  const today = validDate(req.body?.asOfDate)
    ? req.body.asOfDate
    : new Date().toISOString().slice(0, 10);
  const due = db
    .prepare(
      "SELECT s.*,p.interval FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.status='active' AND s.next_billing_date<=? ORDER BY s.id",
    )
    .all(today);
  let created = 0,
    skipped = 0,
    periodsProcessed = 0;
  const run = db.transaction(() => {
    for (const sub of due) {
      let periodStart = sub.next_billing_date;
      let guard = 0;
      while (periodStart <= today && guard < 120) {
        const periodEnd = addInterval(periodStart, sub.interval);
        const existing = db
          .prepare(
            "SELECT id FROM invoices WHERE subscription_id=? AND period_start=?",
          )
          .get(sub.id, periodStart);
        if (existing) {
          skipped++;
        } else {
          invoiceForSubscription(sub.id, periodStart, periodEnd);
          created++;
        }
        db.prepare(
          "UPDATE subscriptions SET next_billing_date=? WHERE id=?",
        ).run(periodEnd, sub.id);
        periodStart = periodEnd;
        guard++;
        periodsProcessed++;
      }
    }
    // Mark unpaid invoices overdue based on their billing-period end date.
    db.prepare(
      "UPDATE invoices SET status='overdue' WHERE status='confirmed' AND period_end<? AND amount_paid_cents<total_cents",
    ).run(today);
  });
  try {
    run();
    res.json({
      asOfDate: today,
      dueSubscriptions: due.length,
      periodsProcessed,
      invoicesCreated: created,
      duplicatePeriodsSkipped: skipped,
    });
  } catch (e) {
    res.status(500).json({ error: "Billing run failed; inspect server logs." });
  }
});
app.get("/api/reports/summary", requireRole("admin", "staff"), (req, res) => {
  const from = validDate(req.query.from) ? req.query.from : "0001-01-01",
    to = validDate(req.query.to) ? req.query.to : "9999-12-31";
  if (from > to)
    return res
      .status(400)
      .json({ error: "Start date must be on or before end date." });
  const active = db
    .prepare("SELECT COUNT(*) n FROM subscriptions WHERE status='active'")
    .get().n;
  const revenue = db
    .prepare(
      "SELECT COALESCE(SUM(amount_cents),0) n FROM payments WHERE payment_date BETWEEN ? AND ?",
    )
    .get(from, to).n;
  const outstanding = db
    .prepare(
      "SELECT COALESCE(SUM(total_cents-amount_paid_cents),0) n FROM invoices WHERE status IN ('confirmed','overdue')",
    )
    .get().n;
  const overdue = db
    .prepare(
      "SELECT COUNT(*) n FROM invoices WHERE status='overdue' OR (status='confirmed' AND period_end<? AND amount_paid_cents<total_cents)",
    )
    .get(new Date().toISOString().slice(0, 10)).n;
  res.json({
    from,
    to,
    activeSubscriptions: active,
    revenueCollectedCents: revenue,
    outstandingCents: outstanding,
    overdueInvoices: overdue,
  });
});

app.get("/api/health", (req, res) =>
  res.json({ status: "ok", tier: 4, app: "SubscriptIQ" }),
);

app.use("/api", (req, res) =>
  res.status(404).json({ error: "API endpoint not found." }),
);
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "dist", "index.html"), (err) => {
    if (err)
      res.status(404).send("Build the React app first with npm run build.");
  });
});
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Unexpected server error." });
});

app.listen(PORT, () => {
  console.log(`SubscriptIQ running at http://localhost:${PORT}`);
  console.log("Demo logins: admin@subscriptiq.demo / Admin@12345!");
});
