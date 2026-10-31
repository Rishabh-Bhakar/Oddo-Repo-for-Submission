import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Package,
  Layers,
  Users,
  Repeat,
  Receipt,
  Wallet,
  Tags,
  FileText,
  ChartNoAxesCombined,
  Settings,
  LogOut,
  Search,
  Bell,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  Menu,
  X,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  CalendarDays,
  ShieldCheck,
  Sparkles,
  Activity,
  Clock3,
  MoreHorizontal,
  Github,
  Eye,
  EyeOff,
  ArrowRight,
  LockKeyhole,
  Check,
  Mail,
} from "lucide-react";
import "./styles.css";

const nav = [
  ["Overview", LayoutDashboard],
  ["Products", Package],
  ["Plans", Layers],
  ["Subscriptions", Repeat],
  ["Invoices", Receipt],
  ["Payments", Wallet],
  ["Quotations", FileText],
  ["Discounts", Tags],
  ["Customers", Users],
  ["Reports", ChartNoAxesCombined],
  ["Settings", Settings],
];
const money = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format((Number(n) || 0) / 100);
const date = (s) =>
  s
    ? new Date(s).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
async function api(url, options = {}) {
  const res = await fetch("/api" + url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
function App() {
  const [user, setUser] = useState(null),
    [checking, setChecking] = useState(true),
    [page, setPage] = useState("Overview"),
    [mobile, setMobile] = useState(false),
    [toast, setToast] = useState(""),
    [refresh, setRefresh] = useState(0),
    [query, setQuery] = useState("");
  
useEffect(() => {
  api("/auth/me")
    .then((d) => setUser(d?.user ?? null))
    .catch(() => setUser(null))
    .finally(() => setChecking(false));
}, []);

  const notify = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 3200);
  };
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    setUser(null);
  }
  if (checking)
    return (
      <div className="loading">
        <div className="brand-mark">S</div>
        <p>Loading SubscriptIQ…</p>
      </div>
    );
  if (!user)
    return (
      <Login
        onLogin={(u) => {
          setUser(u);
          setPage("Overview");
        }}
        notify={notify}
      />
    );
  const role = String(user.role || "customer").toLowerCase();
  const visible = nav.filter(
    ([n]) =>
      ![
        "Reports",
        "Settings",
        "Customers",
        "Discounts",
        "Quotations",
        "Products",
        "Plans",
        "Payments",
      ].includes(n) || ["admin", "staff"].includes(role),
  );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <b>SubscriptIQ</b>
            <small>SUBSCRIPTION CLOUD</small>
          </div>
          <button
            className="mobile-close icon-btn"
            onClick={() => setMobile(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace">
          <div className="workspace-icon">◈</div>
          <div>
            <b>Acme Workspace</b>
            <small>Growth plan</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {visible.map(([name, Icon]) => (
            <button
              key={name}
              className={`nav-item ${page === name ? "active" : ""}`}
              onClick={() => {
                setPage(name);
                setMobile(false);
              }}
            >
              <Icon size={18} />
              <span>{name}</span>
              {name === "Invoices" && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
  <div className="help-card">
    <div className="help-icon">
      <Sparkles size={17} />
    </div>

    <b>Need a hand?</b>

    <p>
      Explore the quick start guide to get more out of SubscriptIQ.
    </p>

    <button
      type="button"
      onClick={() =>
        notify(
          "Quick start: create a product, add a plan, then start a subscription."
        )
      }
    >
      View quick guide
      <ArrowUpRight size={15} />
    </button>
  </div>

  <button
    type="button"
    className="logout-button"
    onClick={async () => {
      try {
        const response = await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Logout failed");
        }

        window.location.replace("/login");
      } catch (error) {
        notify("Unable to log out. Please try again.");
      }
    }}
  >
    <LogOut size={18} />
    <span>Log out</span>
  </button>
</div>
      </aside>
      <main className="main">
        <header className="topbar">
          <button
            className="mobile-menu icon-btn"
            onClick={() => setMobile(true)}
          >
            <Menu />
          </button>
          <div className="crumb">
            Workspace <span>/</span> <b>{page}</b>
          </div>
          <div className="top-actions">
            <div className="searchbox">
              <Search size={16} />
              <input
                placeholder="Search anything…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd>⌘ K</kbd>
            </div>
            <button
              className="icon-btn bell"
              onClick={() => notify("You’re all caught up.")}
            >
              <Bell size={18} />
              <i />
            </button>
            <div className="top-avatar">
              {(user.name || user.email || "U").slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>
        <div className="content">
          <PageContent
            page={page}
            user={user}
            query={query}
            notify={notify}
            refreshKey={refresh}
            refresh={() => setRefresh((x) => x + 1)}
          />
        </div>
        <footer>
          © 2026 SubscriptIQ{" "}
          <span>
            <span className="green-dot" /> All systems operational
          </span>
        </footer>
      </main>
      {toast && (
        <div className="toast">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}
function Login({ onLogin, notify }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [showPassword, setShowPassword] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [showDemo, setShowDemo] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("oauth_error");
    if (oauthError) {
      setError(oauthError);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const d = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      onLogin(d.user || d);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-showcase">
        <div className="auth-brand">
          <div className="auth-brand-mark">
            S<span />
          </div>
          <div>
            <strong>SubscriptIQ</strong>
            <small>SUBSCRIPTION MANAGEMENT</small>
          </div>
        </div>
        <div className="showcase-content">
          <div className="showcase-pill">
            <span className="pulse-dot" /> A clearer way to manage recurring
            revenue
          </div>
          <h1>
            Your subscriptions.
            <br />
            <em>Under control.</em>
          </h1>
          <p className="showcase-copy">
            From the first plan to every renewal, manage your billing operations
            with less busywork and more clarity.
          </p>
          <div className="showcase-preview">
            <div className="preview-top">
              <div>
                <span className="preview-label">MONTHLY RECURRING REVENUE</span>
                <strong>₹2,48,600</strong>
              </div>
              <span className="preview-growth">
                <ArrowUpRight size={14} /> 12.8%
              </span>
            </div>
            <div className="preview-chart">
              <div className="chart-grid">
                <i />
                <i />
                <i />
              </div>
              <svg
                viewBox="0 0 440 100"
                preserveAspectRatio="none"
                aria-label="Illustrative revenue trend"
              >
                <defs>
                  <linearGradient id="revFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#8f83ff" stopOpacity=".32" />
                    <stop offset="100%" stopColor="#8f83ff" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0 82 C24 78 30 68 52 73 S82 62 105 67 S136 40 159 51 S192 45 214 49 S247 24 270 34 S300 43 324 24 S354 35 375 17 S415 20 440 7 L440 100 L0 100Z"
                  fill="url(#revFill)"
                />
                <path
                  d="M0 82 C24 78 30 68 52 73 S82 62 105 67 S136 40 159 51 S192 45 214 49 S247 24 270 34 S300 43 324 24 S354 35 375 17 S415 20 440 7"
                  fill="none"
                  stroke="#9c91ff"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="preview-foot">
              <span>
                <i className="legend-dot purple" /> Recurring revenue
              </span>
              <span>Last 30 days</span>
            </div>
          </div>
          <div className="showcase-benefits">
            <div>
              <span className="benefit-icon">
                <Check size={15} />
              </span>
              <span>
                <b>One connected workspace</b>
                <small>Customers, plans and invoices together</small>
              </span>
            </div>
            <div>
              <span className="benefit-icon">
                <LockKeyhole size={15} />
              </span>
              <span>
                <b>Secure sign-in options</b>
                <small>Use your account or a trusted provider</small>
              </span>
            </div>
          </div>
        </div>
        <div className="showcase-footer">
          <span>BUILT FOR TEAMS THAT KEEP THINGS MOVING</span>
          <span>© 2026 SubscriptIQ</span>
        </div>
        <div className="showcase-orb orb-a" />
        <div className="showcase-orb orb-b" />
      </section>
      <section className="auth-main">
        <div className="auth-mobile-brand">
          <div className="auth-brand-mark">
            S<span />
          </div>
          <strong>SubscriptIQ</strong>
        </div>
        <div className="auth-card">
          <div className="auth-card-heading">
            <div className="auth-step-label">YOUR WORKSPACE AWAITS</div>
            <h2>Welcome back</h2>
            <p>Sign in to continue to your SubscriptIQ workspace.</p>
          </div>
          {error && (
            <div className="auth-error" role="alert">
              <AlertCircle size={17} />
              <span>{error}</span>
            </div>
          )}
          <div className="auth-socials">
            <button
              type="button"
              className="auth-social google-social"
              onClick={() => window.location.assign("/api/auth/google")}
            >
              <span className="google-logo">G</span>
              <span>Continue with Google</span>
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              className="auth-social github-social"
              onClick={() => window.location.assign("/api/auth/github")}
            >
              <Github size={18} />
              <span>Continue with GitHub</span>
              <ArrowRight size={16} />
            </button>
          </div>
          <div className="auth-separator">
            <span>or sign in with email</span>
          </div>
          <form className="auth-form" onSubmit={submit}>
            <label htmlFor="auth-email">Work email</label>
            <div className="auth-input-wrap">
              <Mail size={17} />
              <input
                id="auth-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
              />
            </div>
            <div className="auth-password-label">
              <label htmlFor="auth-password">Password</label>
              <button
                type="button"
                className="auth-forgot"
                onClick={() =>
                  notify(
                    "Password reset is not configured yet. Contact your workspace administrator.",
                  )
                }
              >
                Forgot password?
              </button>
            </div>
            <div className="auth-input-wrap">
              <LockKeyhole size={17} />
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
              <button
                className="password-toggle"
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? (
                <>
                  <span className="auth-spinner" /> Signing you in…
                </>
              ) : (
                <>
                  Sign in to workspace <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
          <div className="auth-demo">
            <button
              type="button"
              className="auth-demo-toggle"
              onClick={() => setShowDemo((v) => !v)}
            >
              <ShieldCheck size={16} />
              <span>Trying the demo?</span>
              <span className="auth-demo-action">
                {showDemo ? "Hide credentials" : "View demo credentials"}{" "}
                <ChevronDown size={14} className={showDemo ? "rotate" : ""} />
              </span>
            </button>
            {showDemo && (
              <div className="auth-demo-details">
                <p>
                  <b>Admin account</b>
                  <span>admin@subscriptiq.demo</span>
                  <span>Admin@12345!</span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEmail("admin@subscriptiq.demo");
                    setPassword("Admin@12345!");
                    notify("Demo credentials filled in.");
                  }}
                >
                  Use demo account
                </button>
              </div>
            )}
          </div>
          <p className="auth-legal">
            By continuing, you agree to our{" "}
            <a
              href="#terms"
              onClick={(e) => {
                e.preventDefault();
                notify("Terms of Service will be available here soon.");
              }}
            >
              Terms
            </a>{" "}
            and{" "}
            <a
              href="#privacy"
              onClick={(e) => {
                e.preventDefault();
                notify("Privacy Policy will be available here soon.");
              }}
            >
              Privacy Policy
            </a>
            .
          </p>
        </div>
        <div className="auth-bottom-note">
          <span className="secure-lock">
            <LockKeyhole size={13} />
          </span>{" "}
          Your workspace, protected{" "}
          <span className="auth-bottom-divider">·</span> Simple, secure access
        </div>
      </section>
    </div>
  );
}
function PageContent({ page, user, query, notify, refreshKey, refresh }) {
  const [data, setData] = useState({}),
    [loading, setLoading] = useState(true),
    [err, setErr] = useState(""),
    [modal, setModal] = useState(null),
    [saving, setSaving] = useState(false),
    [form, setForm] = useState({});
  const [range, setRange] = useState("30");
  const admin = ["admin", "staff"].includes(
    String(user.role || "").toLowerCase(),
  );
  const endpoints = {
    Overview: ["/dashboard"],
    Products: ["/products"],
    Plans: ["/plans"],
    Subscriptions: ["/subscriptions"],
    Invoices: ["/invoices"],
    Payments: ["/payments"],
    Quotations: ["/quotes"],
    Discounts: ["/discounts"],
    Customers: ["/customers"],
    Reports: ["/reports/summary"],
    Settings: ["/settings/tax"],
  };
  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      let results = await Promise.all(
        (endpoints[page] || []).map((p) => api(p)),
      );
      setData(results[0] || {});
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [page, refreshKey]);
  const titleMap = {
    Overview: [
      "Good morning",
      "Here’s what’s happening with your subscriptions today.",
    ],
    Products: ["Products", "Manage the products your customers subscribe to."],
    Plans: [
      "Plans & pricing",
      "Build flexible pricing that fits your business.",
    ],
    Subscriptions: [
      "Subscriptions",
      "Track customer plans, billing cycles and renewals.",
    ],
    Invoices: ["Invoices", "Review invoices and keep payments on track."],
    Payments: ["Payments", "A clear view of every payment received."],
    Quotations: [
      "Quotations",
      "Create proposals and turn accepted quotes into revenue.",
    ],
    Discounts: [
      "Discounts & offers",
      "Create and manage promotional pricing rules.",
    ],
    Customers: ["Customers", "Your customer directory in one place."],
    Reports: [
      "Reports & analytics",
      "Understand revenue, outstanding balances and billing health.",
    ],
    Settings: ["Workspace settings", "Configure tax and billing defaults."],
  };
  const [heading, sub] = titleMap[page] || [page, "Manage your workspace."];
  const openCreate = () => {
    setForm(defaultForm(page));
    setModal(page);
  };
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const config = saveConfig(page, form);
      const result = await api(config.url, {
        method: config.method || "POST",
        body: JSON.stringify(config.body || form),
      });
      notify(
        result.message || `${page.slice(0, -1) || page} saved successfully.`,
      );
      setModal(null);
      await load();
    } catch (e) {
      notify(e.message);
    } finally {
      setSaving(false);
    }
  }
  if (loading)
    return (
      <div className="page-loading">
        <div className="spinner" /> Loading {page.toLowerCase()}…
      </div>
    );
  const obj = data || {};
  const list = Array.isArray(obj)
    ? obj
    : obj.items || obj.data || obj[page.toLowerCase()] || [];
  const filtered = Array.isArray(list)
    ? list.filter((x) =>
        JSON.stringify(x).toLowerCase().includes(query.toLowerCase()),
      )
    : [];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {page === "Overview"
              ? "WORKSPACE OVERVIEW"
              : "MANAGE YOUR BUSINESS"}
          </div>
          <h1>
            {heading}
            {page === "Overview" && <span className="wave">✳</span>}
          </h1>
          <p>{sub}</p>
        </div>
        <div className="heading-actions">
          {page === "Overview" && (
            <button className="secondary-btn" onClick={load}>
              <RefreshCw size={16} /> Refresh
            </button>
          )}
          {admin &&
            [
              "Products",
              "Plans",
              "Subscriptions",
              "Quotations",
              "Discounts",
              "Settings",
            ].includes(page) && (
              <button className="primary-btn" onClick={openCreate}>
                <Plus size={17} />{" "}
                {page === "Settings"
                  ? "Update settings"
                  : `New ${{ Products: "product", Plans: "plan", Subscriptions: "subscription", Quotations: "quotation", Discounts: "discount" }[page]}`}
              </button>
            )}
        </div>
      </div>
      {err && (
        <div className="error-banner">
          <AlertCircle size={17} />
          {err}
          <button className="text-btn" onClick={load}>
            Retry
          </button>
        </div>
      )}
      {page === "Overview" && (
        <Dashboard data={obj} notify={notify} setPage={() => {}} />
      )}
      {page === "Reports" && (
        <Reports data={obj} range={range} setRange={setRange} notify={notify} />
      )}
      {page === "Settings" && (
        <SettingsPanel
          data={obj}
          form={form}
          setForm={setForm}
          save={async () => {
            try {
              await api("/settings/tax", {
                method: "PUT",
                body: JSON.stringify(form),
              });
              notify("Tax settings updated");
              load();
            } catch (e) {
              notify(e.message);
            }
          }}
        />
      )}
      {[
        "Products",
        "Plans",
        "Subscriptions",
        "Invoices",
        "Payments",
        "Quotations",
        "Discounts",
        "Customers",
      ].includes(page) && (
        <DataTable
          page={page}
          rows={filtered}
          original={list}
          openCreate={openCreate}
          notify={notify}
          refresh={load}
          admin={admin}
        />
      )}
      {modal && (
        <Modal
          title={`Create ${modal === "Products" ? "product" : modal === "Plans" ? "plan" : modal === "Subscriptions" ? "subscription" : modal === "Quotations" ? "quotation" : "discount"}`}
          close={() => setModal(null)}
        >
          <form className="modal-form" onSubmit={save}>
            {formFields(modal, form, setForm)}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button className="primary-btn" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function Dashboard({ data, notify }) {
  const [summary, setSummary] = useState({});
  useEffect(() => {
    api("/reports/summary")
      .then(setSummary)
      .catch(() => {});
  }, []);
  const cards = [
    [
      "Total revenue",
      money(data.revenueCollectedCents ?? summary.revenueCollectedCents ?? 0),
      "+12.8%",
      "up",
      Wallet,
    ],
    [
      "Active subscriptions",
      data.activeSubscriptions ?? summary.activeSubscriptions ?? 0,
      "+8.2%",
      "up",
      Repeat,
    ],
    [
      "Outstanding balance",
      money(data.outstandingCents ?? summary.outstandingCents ?? 0),
      "Needs attention",
      "down",
      Receipt,
    ],
    [
      "Overdue invoices",
      data.overdueInvoices ?? summary.overdueInvoices ?? 0,
      "View invoices",
      "down",
      Clock3,
    ],
  ];
  return (
    <>
      <div className="welcome-banner">
        <div>
          <div className="welcome-tag">
            <span className="green-dot" /> LIVE WORKSPACE
          </div>
          <h2>Your business, at a glance.</h2>
          <p>Keep a pulse on recurring revenue and customer health.</p>
          <button
            className="banner-btn"
            onClick={() =>
              notify("Use the navigation to explore your billing workspace.")
            }
          >
            Explore workspace <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="banner-art">
          <div className="art-ring r1" />
          <div className="art-ring r2" />
          <div className="art-core">
            <Activity size={35} />
          </div>
          <div className="float-card fc1">
            <span className="green-dot" /> <b>Revenue is growing</b>
            <small>+12.8% this month</small>
          </div>
          <div className="float-card fc2">
            <span className="art-mini">↗</span>
            <b>Healthy MRR</b>
          </div>
        </div>
      </div>
      <div className="metric-grid">
        {cards.map(([label, value, change, direction, Icon]) => (
          <div className="metric-card" key={label}>
            <div className="metric-top">
              <span>{label}</span>
              <span className="metric-icon">
                <Icon size={18} />
              </span>
            </div>
            <div className="metric-value">{value}</div>
            <div
              className={`metric-change ${direction === "up" ? "positive" : "neutral"}`}
            >
              {direction === "up" ? (
                <ArrowUpRight size={14} />
              ) : (
                <ArrowDownRight size={14} />
              )}
              <span>{change}</span>
              {label === "Overdue invoices" ? "" : " vs last month"}
            </div>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel revenue-panel">
          <div className="panel-head">
            <div>
              <h3>Revenue overview</h3>
              <p>Payment collections over time</p>
            </div>
            <button
              className="select-btn"
              onClick={() => notify("Showing the last 30 days")}
            >
              Last 30 days <ChevronDown size={14} />
            </button>
          </div>
          <RevenueChart />
        </section>
        <section className="panel activity-panel">
          <div className="panel-head">
            <div>
              <h3>Billing health</h3>
              <p>Keep your revenue on track</p>
            </div>
            <MoreHorizontal size={20} />
          </div>
          <div className="health-score">
            <div className="score-ring">
              <b>92</b>
              <small>/100</small>
            </div>
            <div>
              <b>Looking healthy</b>
              <p>Your billing operations are in good shape.</p>
            </div>
          </div>
          <div className="health-row">
            <span>
              <i className="health-dot green" /> Successful payments
            </span>
            <b>98.6%</b>
          </div>
          <div className="health-row">
            <span>
              <i className="health-dot yellow" /> Renewals this week
            </span>
            <b>24</b>
          </div>
          <div className="health-row">
            <span>
              <i className="health-dot red" /> Failed payments
            </span>
            <b>{summary.overdueInvoices ?? 0}</b>
          </div>
          <button
            className="outline-wide"
            onClick={() =>
              notify("Billing health is based on current workspace metrics.")
            }
          >
            View billing insights <ArrowUpRight size={15} />
          </button>
        </section>
      </div>
      <section className="panel quick-panel">
        <div className="panel-head">
          <div>
            <h3>Quick actions</h3>
            <p>Common tasks to keep things moving</p>
          </div>
        </div>
        <div className="quick-actions">
          <Quick
            icon={Package}
            title="Add a product"
            desc="Create a new product"
            onClick={() =>
              notify("Open Products from the sidebar to create a product.")
            }
          />
          <Quick
            icon={Layers}
            title="Build a plan"
            desc="Set up pricing & billing"
            onClick={() =>
              notify("Open Plans from the sidebar to create a plan.")
            }
          />
          <Quick
            icon={FileText}
            title="Create a quote"
            desc="Send a customer proposal"
            onClick={() =>
              notify("Open Quotations from the sidebar to create a quote.")
            }
          />
          <Quick
            icon={ChartNoAxesCombined}
            title="View reports"
            desc="Track your performance"
            onClick={() =>
              notify("Open Reports from the sidebar to view analytics.")
            }
          />
        </div>
      </section>
    </>
  );
}
function Quick({ icon: Icon, title, desc, onClick }) {
  return (
    <button className="quick-action" onClick={onClick}>
      <div className="quick-icon">
        <Icon size={19} />
      </div>
      <div>
        <b>{title}</b>
        <small>{desc}</small>
      </div>
      <ArrowUpRight size={16} className="quick-arrow" />
    </button>
  );
}
function RevenueChart() {
  const vals = [
    26, 35, 31, 48, 43, 57, 50, 63, 54, 72, 67, 85, 78, 93, 80, 100, 88, 108,
    97, 117, 105, 128, 119, 138, 129, 151, 139, 161,
  ];
  return (
    <div className="chart-wrap">
      <div className="chart-y">
        <span>₹2.0L</span>
        <span>₹1.5L</span>
        <span>₹1.0L</span>
        <span>₹0.5L</span>
        <span>₹0</span>
      </div>
      <div className="chart-main">
        <div className="chart-gridlines">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <svg
          viewBox="0 0 700 190"
          preserveAspectRatio="none"
          role="img"
          aria-label="Revenue trend line"
        >
          <defs>
            <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#7567f8" stopOpacity=".22" />
              <stop offset="100%" stopColor="#7567f8" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={
              "M " +
              vals
                .map((v, i) => `${(i * 700) / (vals.length - 1)},${180 - v}`)
                .join(" L ") +
              " L 700,190 L 0,190 Z"
            }
            fill="url(#area)"
          />
          <path
            d={
              "M " +
              vals
                .map((v, i) => `${(i * 700) / (vals.length - 1)},${180 - v}`)
                .join(" L ")
            }
            fill="none"
            stroke="#7567f8"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="chart-x">
          <span>Oct 01</span>
          <span>Oct 07</span>
          <span>Oct 14</span>
          <span>Oct 21</span>
          <span>Oct 30</span>
        </div>
      </div>
    </div>
  );
}
function DataTable({
  page,
  rows,
  original,
  openCreate,
  notify,
  refresh,
  admin,
}) {
  const [actionId, setActionId] = useState(null);
  const cfg = {
    Products: {
      cols: [
        ["name", "Product"],
        ["description", "Description"],
        ["status", "Status"],
      ],
      create: "product",
    },
    Plans: {
      cols: [
        ["name", "Plan"],
        ["product_name", "Product"],
        ["interval", "Billing interval"],
        ["price_cents", "Price"],
      ],
      create: "plan",
    },
    Subscriptions: {
      cols: [
        ["customer_name", "Customer"],
        ["plan_name", "Plan"],
        ["status", "Status"],
        ["next_billing_date", "Next billing"],
        ["price_cents", "Amount"],
      ],
      create: "subscription",
    },
    Invoices: {
      cols: [
        ["invoice_number", "Invoice"],
        ["customer_name", "Customer"],
        ["status", "Status"],
        ["due_date", "Due date"],
        ["total_cents", "Total"],
      ],
      create: null,
    },
    Payments: {
      cols: [
        ["payment_reference", "Reference"],
        ["customer_name", "Customer"],
        ["payment_date", "Date"],
        ["amount_cents", "Amount"],
        ["method", "Method"],
      ],
      create: null,
    },
    Quotations: {
      cols: [
        ["quote_number", "Quote"],
        ["customer_name", "Customer"],
        ["status", "Status"],
        ["valid_until", "Valid until"],
        ["total_cents", "Total"],
      ],
      create: "quotation",
    },
    Discounts: {
      cols: [
        ["name", "Name"],
        ["type", "Type"],
        ["value", "Value"],
        ["usage_limit", "Usage limit"],
        ["status", "Status"],
      ],
      create: "discount",
    },
    Customers: {
      cols: [
        ["name", "Customer"],
        ["email", "Email"],
        ["created_at", "Joined"],
        ["status", "Status"],
      ],
      create: null,
    },
  };
  const c = cfg[page] || { cols: [] };
  return (
    <section className="panel table-panel">
      <div className="table-toolbar">
        <div>
          <h3>
            {page} <span className="count-pill">{original.length}</span>
          </h3>
          <p>Browse and manage your {page.toLowerCase()} records.</p>
        </div>
        <div className="table-actions">
          <button className="secondary-btn" onClick={refresh}>
            <RefreshCw size={15} /> Refresh
          </button>
          {c.create && admin && (
            <button className="primary-btn" onClick={openCreate}>
              <Plus size={16} /> Add {c.create}
            </button>
          )}
        </div>
      </div>
      {original.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <FileText size={23} />
          </div>
          <h3>No {page.toLowerCase()} yet</h3>
          <p>
            Once records are added, they will appear here with live data from
            your workspace.
          </p>
          {c.create && admin && (
            <button className="primary-btn" onClick={openCreate}>
              <Plus size={16} /> Create your first {c.create}
            </button>
          )}
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {c.cols.map(([k, l]) => (
                  <th key={k}>{l}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id || i}>
                  {c.cols.map(([k, l]) => (
                    <td key={k}>{renderCell(k, r[k], r)}</td>
                  ))}
                  <td>
                    <button
                      className="icon-btn row-menu"
                      onClick={() =>
                        setActionId(actionId === r.id ? null : r.id)
                      }
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    {actionId === r.id && (
                      <div className="row-popover">
                        <button
                          onClick={() => {
                            navigator.clipboard?.writeText(
                              JSON.stringify(r, null, 2),
                            );
                            notify("Record details copied");
                            setActionId(null);
                          }}
                        >
                          Copy record details
                        </button>
                        {page === "Subscriptions" && r.status === "active" && (
                          <button
                            onClick={async () => {
                              try {
                                await api(`/subscriptions/${r.id}/close`, {
                                  method: "PATCH",
                                });
                                notify("Subscription closed");
                                refresh();
                              } catch (e) {
                                notify(e.message);
                              }
                              setActionId(null);
                            }}
                          >
                            Close subscription
                          </button>
                        )}
                        {page === "Quotations" && (
                          <button
                            onClick={async () => {
                              try {
                                await api(`/quotes/${r.id}/convert`, {
                                  method: "POST",
                                  body: JSON.stringify({}),
                                });
                                notify("Quotation converted to subscription");
                                refresh();
                              } catch (e) {
                                notify(e.message);
                              }
                              setActionId(null);
                            }}
                          >
                            Convert to subscription
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
function renderCell(k, v, r) {
  if (v == null || v === "") return "—";
  if (k.includes("cents")) return money(v);
  if (
    k.includes("date") ||
    k === "created_at" ||
    k === "due_date" ||
    k === "valid_until"
  )
    return date(v);
  if (k === "status")
    return (
      <span className={`status-pill ${String(v).toLowerCase()}`}>{v}</span>
    );
  if (k === "interval") return <span className="interval-pill">{v}</span>;
  if (k === "email") return <span className="email-cell">{v}</span>;
  return String(v);
}
function Reports({ data, range, setRange, notify }) {
  return (
    <div className="reports-layout">
      <div className="report-filter">
        <span>
          <CalendarDays size={16} /> Reporting period
        </span>
        <select value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
        <button
          className="secondary-btn"
          onClick={() => notify("Report refreshed")}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>
      <div className="metric-grid report-metrics">
        <Metric
          label="Revenue collected"
          value={money(data.revenueCollectedCents)}
          icon={Wallet}
        />
        <Metric
          label="Active subscriptions"
          value={data.activeSubscriptions ?? 0}
          icon={Repeat}
        />
        <Metric
          label="Outstanding balance"
          value={money(data.outstandingCents)}
          icon={Receipt}
        />
        <Metric
          label="Overdue invoices"
          value={data.overdueInvoices ?? 0}
          icon={Clock3}
        />
      </div>
      <section className="panel report-panel">
        <div className="panel-head">
          <div>
            <h3>Revenue summary</h3>
            <p>Totals from recorded payments in your database.</p>
          </div>
          <span className="live-label">
            <span className="green-dot" /> LIVE DATA
          </span>
        </div>
        <div className="report-big-number">
          {money(data.revenueCollectedCents)}
          <small> collected</small>
        </div>
        <p className="muted">
          The revenue summary is calculated from payment records. Use the
          payment date range to compare reporting periods.
        </p>
        <div className="report-note">
          <AlertCircle size={17} /> Report figures are based on current local
          database records, not sample chart data.
        </div>
      </section>
    </div>
  );
}
function Metric({ label, value, icon: Icon }) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">
          <Icon size={18} />
        </span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-change neutral">Calculated from live records</div>
    </div>
  );
}
function SettingsPanel({ data, form, setForm, save }) {
  useEffect(
    () =>
      setForm({
        taxName: data.taxName || data.name || "GST",
        taxRatePercent: data.taxRatePercent ?? data.ratePercent ?? 18,
      }),
    [data],
  );
  return (
    <div className="settings-grid">
      <section className="panel settings-panel">
        <div className="panel-head">
          <div>
            <h3>Tax configuration</h3>
            <p>Configure the tax applied to new invoices.</p>
          </div>
          <div className="settings-icon">
            <Settings size={20} />
          </div>
        </div>
        <label>
          Tax name
          <input
            value={form.taxName || ""}
            onChange={(e) => setForm({ ...form, taxName: e.target.value })}
            placeholder="GST"
          />
        </label>
        <label>
          Tax rate (%)
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={form.taxRatePercent ?? ""}
            onChange={(e) =>
              setForm({ ...form, taxRatePercent: Number(e.target.value) })
            }
          />
        </label>
        <div className="settings-hint">
          <ShieldCheck size={17} /> Updates apply to newly generated invoices.
          Existing invoices remain unchanged.
        </div>
        <button className="primary-btn" onClick={save}>
          Save tax settings <ArrowUpRight size={16} />
        </button>
      </section>
      <section className="panel settings-panel">
        <div className="panel-head">
          <div>
            <h3>Workspace information</h3>
            <p>Application environment and data.</p>
          </div>
        </div>
        <div className="setting-line">
          <span>Application</span>
          <b>SubscriptIQ</b>
        </div>
        <div className="setting-line">
          <span>Database</span>
          <b>SQLite · Local</b>
        </div>
        <div className="setting-line">
          <span>Environment</span>
          <span className="status-pill active">Development</span>
        </div>
        <div className="setting-line">
          <span>API status</span>
          <span className="status-pill active">Connected</span>
        </div>
      </section>
    </div>
  );
}
function Modal({ title, close, children }) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={close}>
            <X size={19} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function defaultForm(page) {
  return (
    {
      Products: { name: "", description: "" },
      Plans: {
        name: "",
        productId: "",
        interval: "monthly",
        price: "",
        currency: "INR",
      },
      Subscriptions: {
        customerId: "",
        planId: "",
        startDate: new Date().toISOString().slice(0, 10),
      },
      Quotations: { customerId: "", planId: "", validUntil: "", notes: "" },
      Discounts: {
        name: "",
        type: "percentage",
        value: "10",
        usageLimit: "",
        validFrom: "",
        validUntil: "",
      },
      Settings: { taxName: "GST", taxRatePercent: 18 },
    }[page] || {}
  );
}
function formFields(page, f, set) {
  const change = (k, v) => set({ ...f, [k]: v });
  const field = (key, label, type = "text", extra = {}) => (
    <label key={key}>
      {label}
      <input
        type={type}
        required={
          ![
            "description",
            "notes",
            "usageLimit",
            "validFrom",
            "validUntil",
            "validUntil",
          ].includes(key)
        }
        value={f[key] ?? ""}
        onChange={(e) =>
          change(
            key,
            type === "number" ? Number(e.target.value) : e.target.value,
          )
        }
        {...extra}
      />
    </label>
  );
  const select = (key, label, opts) => (
    <label key={key}>
      {label}
      <select
        required
        value={f[key] ?? ""}
        onChange={(e) => change(key, e.target.value)}
      >
        <option value="">Select {label.toLowerCase()}</option>
        {opts.map((o) => (
          <option key={o[0]} value={o[0]}>
            {o[1]}
          </option>
        ))}
      </select>
    </label>
  );
  if (page === "Products")
    return (
      <>
        {field("name", "Product name")}
        {field("description", "Description")}
      </>
    );
  if (page === "Plans")
    return (
      <>
        {field("name", "Plan name")}
        {field("productId", "Product ID", "number")}
        {select("interval", "Billing interval", [
          ["daily", "Daily"],
          ["weekly", "Weekly"],
          ["monthly", "Monthly"],
          ["yearly", "Yearly"],
        ])}
        {field("price", "Price (₹)", "number", { min: "0", step: "0.01" })}
      </>
    );
  if (page === "Subscriptions")
    return (
      <>
        {field("customerId", "Customer ID", "number")}
        {field("planId", "Plan ID", "number")}
        {field("startDate", "Start date", "date")}
      </>
    );
  if (page === "Quotations")
    return (
      <>
        {field("customerId", "Customer ID", "number")}
        {field("planId", "Plan ID", "number")}
        {field("validUntil", "Valid until", "date")}
        {field("notes", "Notes")}
      </>
    );
  if (page === "Discounts")
    return (
      <>
        {field("name", "Discount name")}
        {select("type", "Discount type", [
          ["percentage", "Percentage"],
          ["fixed", "Fixed amount"],
        ])}
        {field(
          "value",
          f.type === "percentage" ? "Discount (%)" : "Discount amount (₹)",
          "number",
          { min: "0" },
        )}
        {field("usageLimit", "Usage limit", "number", { min: "1" })}
        {field("validFrom", "Valid from", "date")}
        {field("validUntil", "Valid until", "date")}
      </>
    );
  return null;
}
function saveConfig(page, f) {
  if (page === "Products") return { url: "/products", body: f };
  if (page === "Plans")
    return {
      url: "/plans",
      body: { ...f, priceCents: Math.round(Number(f.price || 0) * 100) },
    };
  if (page === "Subscriptions")
    return {
      url: "/subscriptions",
      body: {
        ...f,
        customerId: Number(f.customerId),
        planId: Number(f.planId),
      },
    };
  if (page === "Quotations")
    return {
      url: "/quotes",
      body: {
        ...f,
        customerId: Number(f.customerId),
        planId: Number(f.planId),
      },
    };
  if (page === "Discounts")
    return {
      url: "/discounts",
      body: {
        ...f,
        value: Number(f.value),
        usageLimit: f.usageLimit ? Number(f.usageLimit) : null,
      },
    };
  return { url: "/", body: f };
}

createRoot(document.getElementById("root")).render(<App />);
