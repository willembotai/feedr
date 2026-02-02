import express from "express";
import cookieParser from "cookie-parser";
import { nanoid } from "nanoid";
import fetch from "node-fetch";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3001);
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret-change-me";

const DATA_DIR = path.resolve(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const adapter = new JSONFile(DB_PATH);
const db = new Low(adapter, {
  users: [],
  orgs: [],
  walls: [],
  sources: [],
  items: [],
  meta: { createdAt: new Date().toISOString(), version: 1 },
});

async function dbRead() {
  await db.read();
  db.data ||= {
    users: [],
    orgs: [],
    walls: [],
    sources: [],
    items: [],
    meta: { createdAt: new Date().toISOString(), version: 1 },
  };
}
async function dbWrite() {
  await db.write();
}

function now() {
  return new Date().toISOString();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cls(...names) {
  return names.filter(Boolean).join(" ");
}

function layout({ title, body, user, metaDescription }) {
  const fullTitle = title ? `${title} · feedr` : "feedr";
  const desc = metaDescription ||
    "feedr verzamelt content van Instagram, TikTok en YouTube en toont het als een mooie social wall op je website.";

  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(desc)}" />
  <link rel="stylesheet" href="/assets/app.css" />
</head>
<body>
  <header class="top">
    <div class="top-inner">
      <a class="brand" href="/" aria-label="feedr home">
        <span class="brand-dot"></span>
        <span class="brand-text">feedr</span>
      </a>
      <nav class="nav" aria-label="Navigatie">
        <a class="nav-link" href="/features">Features</a>
        <a class="nav-link" href="/pricing">Prijzen</a>
        ${user
          ? `<a class="nav-link" href="/dashboard">Dashboard</a><a class="btn btn-ghost" href="/logout">Uitloggen</a>`
          : `<a class="btn btn-ghost" href="/login">Inloggen</a><a class="btn" href="/signup">Gratis starten</a>`}
      </nav>
    </div>
  </header>

  <main class="container">${body}</main>

  <footer class="footer">
    <div class="footer-inner">
      <div class="muted">© ${new Date().getFullYear()} feedr</div>
      <div class="muted">Gemaakt voor snelle social walls — NL-first.</div>
    </div>
  </footer>
</body>
</html>`;
}

function authFromReq(req) {
  const token = req.cookies?.session;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const user = authFromReq(req);
  if (!user) return res.redirect("/login");
  req.user = user;
  next();
}

function planCards() {
  return `
  <section class="plans">
    <div class="plan">
      <div class="plan-top"><div class="badge">Populair om te starten</div><h3>Gratis</h3></div>
      <p class="muted">1 wall · basis embed · handmatige items</p>
      <div class="plan-price">€0<span class="muted">/mnd</span></div>
      <ul class="list">
        <li>1 wall</li>
        <li>Tot 30 items</li>
        <li>Embed via JavaScript</li>
      </ul>
      <a class="btn btn-full" href="/signup">Gratis starten</a>
    </div>

    <div class="plan plan-accent">
      <div class="plan-top"><div class="badge badge-accent">Voor groei</div><h3>Pro</h3></div>
      <p class="muted">Meer walls · branding · moderatie</p>
      <div class="plan-price">Binnenkort</div>
      <ul class="list">
        <li>Meerdere walls</li>
        <li>Branding opties</li>
        <li>Moderatie workflow</li>
      </ul>
      <a class="btn btn-full" href="/signup">Op de wachtlijst</a>
    </div>

    <div class="plan">
      <div class="plan-top"><div class="badge">Teams</div><h3>Business</h3></div>
      <p class="muted">Rollen · werkstromen · rapportage</p>
      <div class="plan-price">Binnenkort</div>
      <ul class="list">
        <li>Teams & rollen</li>
        <li>Advanced moderatie</li>
        <li>Analytics</li>
      </ul>
      <a class="btn btn-full" href="/signup">Op de wachtlijst</a>
    </div>

    <div class="plan">
      <div class="plan-top"><div class="badge">Maatwerk</div><h3>Enterprise</h3></div>
      <p class="muted">SLA · SSO · integraties</p>
      <div class="plan-price">Op aanvraag</div>
      <ul class="list">
        <li>SLA & support</li>
        <li>SSO</li>
        <li>Maatwerk integraties</li>
      </ul>
      <a class="btn btn-full" href="mailto:willembotai@gmail.com">Contact</a>
    </div>
  </section>`;
}

const app = express();
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/assets/app.css", (req, res) => {
  res.type("text/css").send(`
:root{
  --bg:#0b0f17;
  --bg2:#0f1624;
  --panel:rgba(255,255,255,0.04);
  --panel2:rgba(255,255,255,0.06);
  --card:rgba(255,255,255,0.04);
  --text:#e9efff;
  --muted:#a8b3cf;
  --border:rgba(148,163,184,0.18);
  --accent:#6aa6ff;
  --accent2:#7c5cff;
  --good:#54f0b5;
  --danger:#ff6b6b;
  --shadow: 0 10px 30px rgba(0,0,0,.35);
}
*{box-sizing:border-box}
html,body{height:100%}
body{
  margin:0;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
  background:
    radial-gradient(1200px 600px at 15% -10%, rgba(124,92,255,.35), transparent 55%),
    radial-gradient(900px 500px at 85% 0%, rgba(106,166,255,.22), transparent 55%),
    linear-gradient(180deg, var(--bg), var(--bg2));
  color:var(--text);
}
a{color:inherit}

.top{position:sticky;top:0;z-index:20;border-bottom:1px solid var(--border);backdrop-filter: blur(10px);background:rgba(11,15,23,0.65)}
.top-inner{max-width:1100px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;padding:14px 18px;gap:14px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;font-weight:900;letter-spacing:.2px}
.brand-dot{width:10px;height:10px;border-radius:999px;background:linear-gradient(135deg,var(--accent),var(--accent2));box-shadow:0 0 0 4px rgba(106,166,255,.12)}
.brand-text{font-size:16px}

.nav{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}
.nav-link{color:var(--muted);text-decoration:none;padding:8px 10px;border-radius:10px}
.nav-link:hover{color:var(--text);background:rgba(255,255,255,0.05)}

.container{max-width:1100px;margin:0 auto;padding:22px 18px 40px}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;text-decoration:none;border:1px solid transparent;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#06101f;padding:10px 12px;border-radius:12px;font-weight:900;cursor:pointer;box-shadow: 0 10px 30px rgba(106,166,255,.18)}
.btn:hover{filter:brightness(1.05)}
.btn-ghost{background:transparent;color:var(--text);border-color:var(--border);box-shadow:none}
.btn-ghost:hover{background:rgba(255,255,255,0.06)}
.btn-full{width:100%}

.hero{position:relative;overflow:hidden;border:1px solid var(--border);border-radius:18px;padding:24px;background:linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03));box-shadow:var(--shadow)}
.hero-grid{display:grid;grid-template-columns: 1.15fr .85fr;gap:18px;align-items:stretch}
@media(max-width:980px){.hero-grid{grid-template-columns:1fr}}
.hero h1{margin:0 0 10px;font-size:38px;line-height:1.05;letter-spacing:-.5px}
.hero p{margin:0;color:var(--muted);font-size:15px;line-height:1.6}
.hero-cta{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}

.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:18px}
@media(max-width:820px){.kpis{grid-template-columns:1fr}}
.kpi{border:1px solid var(--border);background:rgba(0,0,0,0.2);border-radius:16px;padding:12px}
.kpi b{display:block;font-size:18px}
.kpi .muted{font-size:12px}

.panel{border:1px solid var(--border);background:var(--panel);border-radius:16px;padding:14px}
.panel h3{margin:0 0 8px;font-size:14px;letter-spacing:.2px}

.section{margin-top:18px}
.section h2{margin:0 0 10px;font-size:20px}
.muted{color:var(--muted)}

.feature-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
@media(max-width:980px){.feature-grid{grid-template-columns:1fr}}
.feature{border:1px solid var(--border);background:var(--card);border-radius:16px;padding:14px}
.feature .icon{width:34px;height:34px;border-radius:12px;display:grid;place-items:center;background:rgba(106,166,255,.12);border:1px solid rgba(106,166,255,.25);margin-bottom:10px}
.feature h3{margin:0 0 6px;font-size:14px}
.feature p{margin:0;color:var(--muted);font-size:13px;line-height:1.55}

.plans{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
@media(max-width:1100px){.plans{grid-template-columns:repeat(2,1fr)}}
@media(max-width:720px){.plans{grid-template-columns:1fr}}
.plan{border:1px solid var(--border);background:linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03));border-radius:18px;padding:14px;box-shadow:var(--shadow)}
.plan-accent{border-color:rgba(124,92,255,.45)}
.plan-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.plan h3{margin:6px 0 0;font-size:16px}
.badge{display:inline-flex;align-items:center;gap:8px;font-size:11px;color:var(--muted);border:1px solid var(--border);padding:4px 8px;border-radius:999px;background:rgba(0,0,0,0.22)}
.badge-accent{border-color:rgba(124,92,255,.45);color:#dcd4ff}
.plan-price{font-weight:950;font-size:22px;margin-top:10px}
.list{margin:10px 0 12px;padding-left:18px;color:var(--muted)}
.list li{margin:6px 0}

form{display:flex;flex-direction:column;gap:10px}
label{display:flex;flex-direction:column;gap:6px;color:var(--muted);font-size:12px}
input,select,textarea{background:rgba(0,0,0,0.25);border:1px solid var(--border);color:var(--text);padding:11px 12px;border-radius:12px;outline:none}
input:focus,select:focus,textarea:focus{border-color:rgba(106,166,255,.6);box-shadow:0 0 0 4px rgba(106,166,255,.12)}

.table{width:100%;border-collapse:collapse;border:1px solid var(--border);border-radius:14px;overflow:hidden;background:rgba(0,0,0,0.18)}
.table th,.table td{padding:12px;border-bottom:1px solid var(--border);text-align:left}
.table th{color:var(--muted);font-size:12px;background:rgba(255,255,255,0.03)}

.kbd{font-family: ui-monospace, Menlo, Consolas, monospace;background:rgba(0,0,0,0.25);border:1px solid var(--border);padding:2px 8px;border-radius:999px;color:#cfe0ff}

.notice{border:1px solid rgba(106,166,255,.35);background:rgba(106,166,255,.08);padding:12px;border-radius:14px}

.wallgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
@media(max-width:980px){.wallgrid{grid-template-columns:1fr}}
.item{border:1px solid var(--border);border-radius:16px;background:rgba(0,0,0,0.18);padding:10px;overflow:hidden}
.item .meta{color:var(--muted);font-size:12px;margin-top:8px}

.footer{border-top:1px solid var(--border);background:rgba(11,15,23,0.55)}
.footer-inner{max-width:1100px;margin:0 auto;padding:16px 18px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
pre{margin:0}
  `);
});

app.get("/", async (req, res) => {
  const user = authFromReq(req);

  const body = `
  <section class="hero">
    <div class="hero-grid">
      <div>
        <h1>Maak in 5 minuten een social wall voor je website.</h1>
        <p>Verzamel posts van <b>Instagram</b>, <b>TikTok</b> en <b>YouTube</b> en toon ze als een strak grid. Alles in het Nederlands, multi-tenant en met een embed snippet zonder iframe.</p>
        <div class="hero-cta">
          <a class="btn" href="/signup">Gratis starten</a>
          <a class="btn btn-ghost" href="/features">Bekijk features</a>
        </div>

        <div class="kpis">
          <div class="kpi"><b>NL-first</b><div class="muted">UI & teksten volledig Nederlands</div></div>
          <div class="kpi"><b>Embed zonder iframe</b><div class="muted">JavaScript snippet voor websites</div></div>
          <div class="kpi"><b>Multi-tenant</b><div class="muted">Elke klant zijn eigen omgeving</div></div>
        </div>
      </div>

      <div class="panel">
        <h3>Snelle demo</h3>
        <p class="muted">Maak een account aan, voeg 3 URLs toe en pak direct de embed code.</p>
        <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
          <a class="btn btn-full" href="/signup">Gratis account</a>
          <a class="btn btn-ghost btn-full" href="/pricing">Prijzen bekijken</a>
        </div>
        <p class="muted" style="margin-top:10px;font-size:12px">Betalingen via Mollie komen later. Nu: MVP.</p>
      </div>
    </div>
  </section>

  <section class="section">
    <h2>Duidelijke workflow</h2>
    <div class="feature-grid">
      <div class="feature"><div class="icon">1</div><h3>Wall aanmaken</h3><p>Maak per organisatie één of meerdere walls met eigen slug/URL.</p></div>
      <div class="feature"><div class="icon">2</div><h3>Content toevoegen</h3><p>Plak een Instagram/TikTok/YouTube link. We proberen oEmbed, anders fallbacks.</p></div>
      <div class="feature"><div class="icon">3</div><h3>Embed op je site</h3><p>Gebruik onze JavaScript snippet. Geen iframe, wel flexibel.</p></div>
    </div>
  </section>

  <section class="section">
    <h2>Prijzen</h2>
    <p class="muted">Start gratis. Later koppelen we Mollie en zetten we Pro/Business live.</p>
    ${planCards()}
  </section>

  <section class="section">
    <div class="notice">
      <b>Opmerking over API’s:</b> Instagram/TikTok hebben beperkingen. In deze MVP focussen we op snel live gaan via URL/oEmbed. Later bouwen we echte sync met API keys & approvals.
    </div>
  </section>
  `;

  res.send(
    layout({
      title: "",
      body,
      user,
      metaDescription:
        "feedr: maak een social wall voor je website met Instagram, TikTok en YouTube. Volledig Nederlands. Embed zonder iframe.",
    })
  );
});

app.get("/features", (req, res) => {
  const user = authFromReq(req);
  const body = `
  <section class="hero">
    <div class="hero-grid">
      <div>
        <h1>Features die je direct voelt.</h1>
        <p>Geen gedoe. Je krijgt een wall, beheer, en een snippet die je zo op je site plakt.</p>
        <div class="hero-cta"><a class="btn" href="/signup">Gratis starten</a><a class="btn btn-ghost" href="/pricing">Prijzen</a></div>
      </div>
      <div class="panel">
        <h3>Wat zit er al in de MVP?</h3>
        <ul class="list">
          <li>Multi-tenant organisaties</li>
          <li>Login (e-mail + wachtwoord)</li>
          <li>Publieke wall pagina</li>
          <li>Embed code (JavaScript)</li>
          <li>URL toevoegen voor Instagram/TikTok/YouTube</li>
        </ul>
      </div>
    </div>
  </section>

  <section class="section">
    <h2>Waarom dit werkt</h2>
    <div class="feature-grid">
      <div class="feature"><div class="icon">⚡</div><h3>Snel live</h3><p>Je eerste wall staat in minuten. Perfect voor landing pages.</p></div>
      <div class="feature"><div class="icon">🧩</div><h3>Makkelijk te embedden</h3><p>Snippet zonder iframe. Dus styling/lay-out voelt “native”.</p></div>
      <div class="feature"><div class="icon">🧱</div><h3>Multi-tenant basis</h3><p>Gemaakt om later klanten + billing toe te voegen.</p></div>
    </div>
  </section>

  <section class="section">
    <div class="notice">Tip: wil je dat het altijd werkt? Dan voegen we een “handmatige post” (afbeelding + link) fallback toe.</div>
  </section>
  `;
  res.send(layout({ title: "Features", body, user }));
});

app.get("/pricing", (req, res) => {
  const user = authFromReq(req);
  const body = `
  <section class="hero">
    <div class="hero-grid">
      <div>
        <h1>Prijzen die meeschalen.</h1>
        <p>Start gratis. Schaal later op naar Pro/Business. Mollie integratie voegen we toe zodra je er klaar voor bent.</p>
        <div class="hero-cta"><a class="btn" href="/signup">Gratis starten</a><a class="btn btn-ghost" href="/features">Features</a></div>
      </div>
      <div class="panel">
        <h3>Billing</h3>
        <p class="muted">Nog niet actief in MVP. Later: Mollie abonnementen + plan limits + facturen.</p>
      </div>
    </div>
  </section>
  ${planCards()}
  `;
  res.send(layout({ title: "Prijzen", body, user }));
});

app.get("/signup", (req, res) => {
  const user = authFromReq(req);
  const body = `
  <section class="hero">
    <div class="hero-grid">
      <div>
        <h1>Gratis starten</h1>
        <p>Maak een organisatie aan. Daarna maak je je eerste wall en kun je meteen embedden.</p>
      </div>
      <div class="panel">
        <form method="post" action="/signup">
          <label>Organisatienaam<input name="orgName" required /></label>
          <label>E-mail<input name="email" type="email" required /></label>
          <label>Wachtwoord<input name="password" type="password" minlength="8" required /></label>
          <button class="btn btn-full" type="submit">Account aanmaken</button>
        </form>
        <p class="muted" style="margin-top:10px;font-size:12px">Heb je al een account? <a href="/login">Inloggen</a></p>
      </div>
    </div>
  </section>`;
  res.send(layout({ title: "Registreren", body, user }));
});

app.post("/signup", async (req, res) => {
  await dbRead();
  const orgName = String(req.body.orgName || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!orgName || !email || password.length < 8) return res.status(400).send("Ongeldige invoer.");
  if (db.data.users.some((u) => u.email === email)) return res.status(400).send("E-mail bestaat al.");

  const org = { id: nanoid(), name: orgName, plan: "free", createdAt: now() };
  const user = {
    id: nanoid(),
    orgId: org.id,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: now(),
  };
  db.data.orgs.push(org);
  db.data.users.push(user);

  const wall = {
    id: nanoid(),
    orgId: org.id,
    name: "Mijn eerste wall",
    slug: `mijn-wall-${Math.floor(Math.random() * 10000)}`,
    createdAt: now(),
  };
  db.data.walls.push(wall);

  await dbWrite();

  const token = jwt.sign({ userId: user.id, orgId: org.id, email: user.email }, JWT_SECRET, { expiresIn: "30d" });
  res.cookie("session", token, { httpOnly: true, sameSite: "lax" });
  res.redirect("/dashboard");
});

app.get("/login", (req, res) => {
  const user = authFromReq(req);
  const body = `
  <section class="hero">
    <div class="hero-grid">
      <div>
        <h1>Inloggen</h1>
        <p>Welkom terug. Ga naar je dashboard om je wall te beheren.</p>
      </div>
      <div class="panel">
        <form method="post" action="/login">
          <label>E-mail<input name="email" type="email" required /></label>
          <label>Wachtwoord<input name="password" type="password" required /></label>
          <button class="btn btn-full" type="submit">Inloggen</button>
        </form>
        <p class="muted" style="margin-top:10px;font-size:12px">Nog geen account? <a href="/signup">Gratis starten</a></p>
      </div>
    </div>
  </section>`;
  res.send(layout({ title: "Inloggen", body, user }));
});

app.post("/login", async (req, res) => {
  await dbRead();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = db.data.users.find((u) => u.email === email);
  if (!user) return res.status(400).send("Onjuiste inloggegevens.");
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(400).send("Onjuiste inloggegevens.");
  const token = jwt.sign({ userId: user.id, orgId: user.orgId, email: user.email }, JWT_SECRET, { expiresIn: "30d" });
  res.cookie("session", token, { httpOnly: true, sameSite: "lax" });
  res.redirect("/dashboard");
});

app.get("/logout", (req, res) => {
  res.clearCookie("session");
  res.redirect("/");
});

app.get("/dashboard", requireAuth, async (req, res) => {
  await dbRead();
  const org = db.data.orgs.find((o) => o.id === req.user.orgId);
  const walls = db.data.walls.filter((w) => w.orgId === req.user.orgId);

  const rows = walls
    .map(
      (w) => `
<tr>
  <td><b>${escapeHtml(w.name)}</b><div class="muted" style="font-size:12px">/w/${escapeHtml(w.slug)}</div></td>
  <td><span class="kbd">${escapeHtml(w.slug)}</span></td>
  <td><a href="/w/${encodeURIComponent(w.slug)}" target="_blank" rel="noopener">Open</a></td>
  <td><a href="/dashboard/walls/${encodeURIComponent(w.id)}">Beheer</a></td>
</tr>`
    )
    .join("");

  const body = `
  <section class="hero">
    <div class="hero-grid">
      <div>
        <h1>Dashboard</h1>
        <p>Organisatie: <b>${escapeHtml(org?.name || "-")}</b> · Plan: <b>${escapeHtml(org?.plan || "free")}</b></p>
        <div class="hero-cta">
          <a class="btn" href="/dashboard/new-wall">+ Nieuwe wall</a>
          <a class="btn btn-ghost" href="/features">Features</a>
        </div>
      </div>
      <div class="panel">
        <h3>Volgende stap</h3>
        <p class="muted">Open een wall en voeg een paar URLs toe. Pak daarna de embed code.</p>
      </div>
    </div>
  </section>

  <section class="section">
    <h2>Jouw walls</h2>
    <table class="table">
      <thead><tr><th>Wall</th><th>Slug</th><th>Publiek</th><th>Beheer</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="4" class="muted">Nog geen walls.</td></tr>`}</tbody>
    </table>
  </section>
  `;

  res.send(layout({ title: "Dashboard", body, user: req.user }));
});

app.get("/dashboard/new-wall", requireAuth, (req, res) => {
  const body = `
  <section class="hero">
    <div class="hero-grid">
      <div>
        <h1>Nieuwe wall</h1>
        <p>Maak een nieuwe wall aan voor een pagina, campagne of klant.</p>
      </div>
      <div class="panel">
        <form method="post" action="/dashboard/new-wall">
          <label>Naam<input name="name" required /></label>
          <label>Slug (in URL)<input name="slug" placeholder="bijv. showroom" required /></label>
          <button class="btn btn-full" type="submit">Aanmaken</button>
        </form>
        <p class="muted" style="margin-top:10px;font-size:12px">Tip: slug mag alleen letters, cijfers en streepjes.</p>
      </div>
    </div>
  </section>
  `;
  res.send(layout({ title: "Nieuwe wall", body, user: req.user }));
});

app.post("/dashboard/new-wall", requireAuth, async (req, res) => {
  await dbRead();
  const name = String(req.body.name || "").trim();
  let slug = String(req.body.slug || "").trim().toLowerCase();
  slug = slug.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!name || !slug) return res.status(400).send("Ongeldige invoer.");
  if (db.data.walls.some((w) => w.slug === slug)) return res.status(400).send("Slug bestaat al.");

  const wall = { id: nanoid(), orgId: req.user.orgId, name, slug, createdAt: now() };
  db.data.walls.push(wall);
  await dbWrite();
  res.redirect(`/dashboard/walls/${wall.id}`);
});

app.get("/dashboard/walls/:id", requireAuth, async (req, res) => {
  await dbRead();
  const wall = db.data.walls.find((w) => w.id === req.params.id && w.orgId === req.user.orgId);
  if (!wall) return res.status(404).send("Niet gevonden.");

  const sources = db.data.sources.filter((s) => s.wallId === wall.id);
  const items = db.data.items
    .filter((it) => it.wallId === wall.id)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const srcRows = sources
    .map((s) => `<tr><td>${escapeHtml(s.type)}</td><td>${escapeHtml(s.url)}</td><td>${escapeHtml(s.status || "ok")}</td></tr>`)
    .join("");

  const embedSnippet = `
<script>
  (function(){
    var s=document.createElement('script');
    s.src='${APP_BASE_URL}/widget/feedr.js?wall=${encodeURIComponent(wall.slug)}';
    s.async=true;
    document.currentScript.parentNode.insertBefore(s, document.currentScript);
  })();
</script>
<div data-feedr-wall="${escapeHtml(wall.slug)}"></div>`;

  const body = `
  <section class="hero">
    <div class="hero-grid">
      <div>
        <h1>${escapeHtml(wall.name)}</h1>
        <p>Publieke URL: <a href="/w/${encodeURIComponent(wall.slug)}" target="_blank" rel="noopener">${escapeHtml(APP_BASE_URL)}/w/${escapeHtml(wall.slug)}</a></p>
        <div class="hero-cta">
          <a class="btn" href="/w/${encodeURIComponent(wall.slug)}" target="_blank" rel="noopener">Open wall</a>
          <a class="btn btn-ghost" href="/dashboard">Terug</a>
        </div>
      </div>
      <div class="panel">
        <h3>Embed (geen iframe)</h3>
        <p class="muted">Plak de snippet op je website waar je de wall wilt tonen.</p>
      </div>
    </div>
  </section>

  <section class="section">
    <h2>Content toevoegen</h2>
    <div class="panel">
      <form method="post" action="/dashboard/walls/${encodeURIComponent(wall.id)}/add-url">
        <label>Platform
          <select name="type">
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="youtube">YouTube</option>
          </select>
        </label>
        <label>URL (post/video)
          <input name="url" placeholder="https://..." required />
        </label>
        <button class="btn" type="submit">Toevoegen</button>
      </form>
      <p class="muted" style="margin-top:10px;font-size:12px">In deze MVP voeg je content toe via URL. Automatische sync komt later.</p>
    </div>
  </section>

  <section class="section">
    <h2>Bronnen</h2>
    <table class="table"><thead><tr><th>Platform</th><th>URL</th><th>Status</th></tr></thead><tbody>${srcRows || `<tr><td colspan="3" class="muted">Nog geen bronnen.</td></tr>`}</tbody></table>
  </section>

  <section class="section">
    <h2>Embed code (JavaScript)</h2>
    <pre class="panel" style="white-space:pre-wrap;overflow:auto">${escapeHtml(embedSnippet)}</pre>
  </section>

  <section class="section">
    <h2>Preview (${items.length} items)</h2>
    <div class="wallgrid">
      ${items
        .slice(0, 9)
        .map(
          (it) => `<div class="item"><div>${it.html || `<a href="${escapeHtml(it.url)}" target="_blank" rel="noopener">Open</a>`}</div><div class="meta">${escapeHtml(it.provider || it.type)} · ${escapeHtml(new Date(it.createdAt).toLocaleString("nl-NL"))}</div></div>`
        )
        .join("") || `<div class="muted">Nog geen items.</div>`}
    </div>
  </section>
  `;

  res.send(layout({ title: `Wall: ${wall.name}`, body, user: req.user }));
});

async function resolveEmbed({ type, url }) {
  const u = String(url).trim();
  if (!u) throw new Error("URL ontbreekt");

  if (type === "youtube") {
    const o = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}`).then((r) => (r.ok ? r.json() : null));
    if (o?.html) return { provider: "YouTube", title: o.title || "", html: o.html };
  }

  if (type === "tiktok") {
    const o = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(u)}`).then((r) => (r.ok ? r.json() : null));
    if (o?.html) return { provider: "TikTok", title: o.title || "", html: o.html };
  }

  if (type === "instagram") {
    // Instagram oEmbed often requires auth; try public endpoint as best-effort
    const o = await fetch(`https://api.instagram.com/oembed?url=${encodeURIComponent(u)}`).then((r) => (r.ok ? r.json() : null));
    if (o?.html) return { provider: "Instagram", title: o.title || "", html: o.html };
  }

  return { provider: type, title: "", html: "" };
}

app.post("/dashboard/walls/:id/add-url", requireAuth, async (req, res) => {
  await dbRead();
  const wall = db.data.walls.find((w) => w.id === req.params.id && w.orgId === req.user.orgId);
  if (!wall) return res.status(404).send("Niet gevonden.");

  const type = String(req.body.type || "").toLowerCase();
  const url = String(req.body.url || "").trim();
  if (!url) return res.status(400).send("URL ontbreekt.");
  if (!["youtube", "tiktok", "instagram"].includes(type)) return res.status(400).send("Onbekend type.");

  const src = { id: nanoid(), wallId: wall.id, type, url, status: "ok", createdAt: now() };
  db.data.sources.push(src);

  let embed;
  try {
    embed = await resolveEmbed({ type, url });
  } catch {
    src.status = "fout";
    embed = { provider: type, title: "", html: "" };
  }

  const item = {
    id: nanoid(),
    wallId: wall.id,
    type,
    url,
    provider: embed.provider,
    title: embed.title,
    html: embed.html,
    createdAt: now(),
  };
  db.data.items.push(item);

  await dbWrite();
  res.redirect(`/dashboard/walls/${wall.id}`);
});

app.get("/w/:slug", async (req, res) => {
  await dbRead();
  const wall = db.data.walls.find((w) => w.slug === req.params.slug);
  if (!wall) return res.status(404).send("Niet gevonden.");

  const items = db.data.items.filter((it) => it.wallId === wall.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const body = `
  <section class="hero">
    <div class="hero-grid">
      <div>
        <h1>${escapeHtml(wall.name)}</h1>
        <p class="muted">feedr wall · ${items.length} items</p>
      </div>
      <div class="panel">
        <h3>Wil je dit ook?</h3>
        <p class="muted">Maak gratis een account en embed jouw wall op je site.</p>
        <a class="btn btn-full" href="/signup">Gratis starten</a>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="wallgrid">
      ${items
        .map((it) => `<div class="item"><div>${it.html || `<a href="${escapeHtml(it.url)}" target="_blank" rel="noopener">Open</a>`}</div><div class="meta">${escapeHtml(it.provider || it.type)}</div></div>`)
        .join("") || `<div class="muted">Nog geen items.</div>`}
    </div>
  </section>
  `;

  res.send(layout({ title: wall.name, body, user: authFromReq(req) }));
});

app.get("/api/walls/:slug/items", async (req, res) => {
  await dbRead();
  const wall = db.data.walls.find((w) => w.slug === req.params.slug);
  if (!wall) return res.status(404).json({ error: "niet gevonden" });
  const items = db.data.items
    .filter((it) => it.wallId === wall.id)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 30)
    .map((it) => ({
      id: it.id,
      type: it.type,
      url: it.url,
      provider: it.provider,
      title: it.title,
      html: it.html,
      createdAt: it.createdAt,
    }));
  res.json({ wall: { name: wall.name, slug: wall.slug }, items });
});

app.get("/widget/feedr.js", async (req, res) => {
  const slug = String(req.query.wall || "");
  res.type("application/javascript").send(`
(function(){
  var slug=${JSON.stringify(slug)};
  var host=${JSON.stringify(APP_BASE_URL)};

  function el(tag, props){
    var n=document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function(k){
      if(k === 'style') Object.assign(n.style, props[k]);
      else if(k === 'html') n.innerHTML = props[k];
      else n.setAttribute(k, props[k]);
    });
    return n;
  }

  function render(container, data){
    container.innerHTML='';

    var wrap = el('div', { style: {
      display:'grid',
      gridTemplateColumns:'repeat(3, minmax(0, 1fr))',
      gap:'12px',
      fontFamily:"system-ui,-apple-system,Segoe UI,Roboto,Arial",
    }});

    if (window.matchMedia && window.matchMedia('(max-width: 980px)').matches) {
      wrap.style.gridTemplateColumns='1fr';
    }

    (data.items||[]).forEach(function(it){
      var card = el('div', { style: {
        border:'1px solid rgba(148,163,184,0.18)',
        borderRadius:'16px',
        padding:'10px',
        background:'rgba(0,0,0,0.18)',
        color:'#e9efff',
        overflow:'hidden'
      }});
      card.innerHTML = it.html ? it.html : '<a href="'+it.url+'" target="_blank" rel="noopener">Open</a>';
      wrap.appendChild(card);
    });

    container.appendChild(wrap);
  }

  function boot(){
    var container=document.querySelector('[data-feedr-wall="'+slug+'"]');
    if(!container) return;
    fetch(host+'/api/walls/'+encodeURIComponent(slug)+'/items')
      .then(function(r){ return r.json(); })
      .then(function(data){ render(container, data); })
      .catch(function(){ container.innerHTML = 'feedr: kon items niet laden.'; });
  }

  boot();
})();
  `);
});

app.listen(PORT, () => {
  console.log(`feedr draait op ${APP_BASE_URL}`);
});
