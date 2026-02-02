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

function layout({ title, body, user, metaDescription }) {
  const fullTitle = title ? `${title} · feedr` : "feedr";
  const desc =
    metaDescription ||
    "feedr maakt social walls voor websites: verzamel content van Instagram, TikTok en YouTube en embed zonder iframe.";

  const topnav = `
    <a class="nav-link" href="/product">Product</a>
    <a class="nav-link" href="/use-cases">Use cases</a>
    <a class="nav-link" href="/pricing">Prijzen</a>
    <a class="nav-link" href="/security">Security</a>
  `;

  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(desc)}" />
  <meta name="theme-color" content="#FFFFFF" />
  <link rel="stylesheet" href="/assets/app.css" />
</head>
<body>
  <header class="top">
    <div class="top-inner">
      <a class="brand" href="/" aria-label="feedr home">
        <span class="brand-mark" aria-hidden="true"></span>
        <span class="brand-text">feedr</span>
      </a>
      <nav class="nav" aria-label="Navigatie">
        ${topnav}
        ${user
          ? `<a class="nav-link" href="/dashboard">Dashboard</a><a class="btn btn-ghost" href="/logout">Uitloggen</a>`
          : `<a class="btn btn-ghost" href="/login">Inloggen</a><a class="btn" href="/signup">Start gratis</a>`}
      </nav>
    </div>
  </header>

  <main class="container">${body}</main>

  <footer class="footer">
    <div class="footer-inner">
      <div>
        <div class="footer-brand">feedr</div>
        <div class="muted">Social walls voor websites — NL-first.</div>
      </div>
      <div class="muted">© ${new Date().getFullYear()} feedr</div>
    </div>
  </footer>
</body>
</html>`;
}

function ctaStrip() {
  return `
  <div class="cta-strip">
    <div>
      <b>Start gratis</b><span class="muted"> · geen creditcard nodig</span>
    </div>
    <div class="cta-actions">
      <a class="btn" href="/signup">Start gratis</a>
      <a class="btn btn-ghost" href="/product">Bekijk hoe het werkt</a>
    </div>
  </div>`;
}

function pricingCards() {
  return `
  <section class="pricing">
    <div class="pricing-card">
      <div class="badge">Beste start</div>
      <h3>Gratis</h3>
      <p class="muted">Voor eerste tests en kleine websites.</p>
      <div class="price">€0<span class="muted">/mnd</span></div>
      <ul class="list">
        <li>1 wall</li>
        <li>Tot 30 items</li>
        <li>Embed via JavaScript (geen iframe)</li>
      </ul>
      <a class="btn btn-full" href="/signup">Start gratis</a>
      <div class="micro muted">Geen creditcard nodig</div>
    </div>

    <div class="pricing-card pricing-card-featured">
      <div class="badge badge-accent">Voor groei</div>
      <h3>Pro</h3>
      <p class="muted">Meer walls, branding en moderatie.</p>
      <div class="price">Binnenkort</div>
      <ul class="list">
        <li>Meerdere walls</li>
        <li>Branding opties</li>
        <li>Moderatie workflow</li>
      </ul>
      <a class="btn btn-full" href="/signup">Op de wachtlijst</a>
      <div class="micro muted">Mollie koppeling volgt</div>
    </div>

    <div class="pricing-card">
      <div class="badge">Teams</div>
      <h3>Business</h3>
      <p class="muted">Rollen, teams en inzichten.</p>
      <div class="price">Binnenkort</div>
      <ul class="list">
        <li>Teams & rollen</li>
        <li>Advanced moderatie</li>
        <li>Analytics</li>
      </ul>
      <a class="btn btn-full" href="/signup">Op de wachtlijst</a>
    </div>

    <div class="pricing-card">
      <div class="badge">Maatwerk</div>
      <h3>Enterprise</h3>
      <p class="muted">SLA, SSO en integraties.</p>
      <div class="price">Op aanvraag</div>
      <ul class="list">
        <li>SLA & support</li>
        <li>SSO</li>
        <li>Maatwerk integraties</li>
      </ul>
      <a class="btn btn-full" href="mailto:willembotai@gmail.com">Contact</a>
    </div>
  </section>`;
}

function faqBlock() {
  return `
  <section class="section">
    <h2>FAQ</h2>
    <div class="faq">
      <details open><summary>Heb ik een creditcard nodig?</summary><p>Nee. Het Gratis plan werkt zonder creditcard.</p></details>
      <details><summary>Hoe embed ik de wall zonder iframe?</summary><p>Je krijgt een JavaScript snippet die je in je website plakt. Daarmee laden we de wall via onze API.</p></details>
      <details><summary>Werkt Instagram/TikTok altijd automatisch?</summary><p>Niet altijd. Deze platformen hebben beperkingen (oEmbed/API). In de MVP focussen we op URL/oEmbed “best effort”; echte API-koppelingen voegen we later toe.</p></details>
      <details><summary>Is dit multi-tenant?</summary><p>Ja. Elke organisatie heeft zijn eigen walls, users en instellingen.</p></details>
      <details><summary>Kan ik later betalen via Mollie?</summary><p>Ja. We voegen later Mollie abonnementen en plan-limieten toe.</p></details>
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
  --bg:#ffffff;
  --bg2:#f6f7fb;
  --panel:#ffffff;
  --card:#ffffff;
  --text:#0b1220;
  --muted:#5b667a;
  --border:rgba(15,23,42,0.10);
  --shadow: 0 12px 30px rgba(15,23,42,0.10);
  --accent:#2563eb;
  --accent2:#7c3aed;
  --accentSoft: rgba(37,99,235,0.10);
  --accentSoft2: rgba(124,58,237,0.10);
}
*{box-sizing:border-box}
html,body{height:100%}
body{
  margin:0;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
  background: linear-gradient(180deg, var(--bg), var(--bg2));
  color: var(--text);
}
a{color:inherit}

.top{position:sticky;top:0;z-index:20;border-bottom:1px solid var(--border);background:rgba(255,255,255,0.9);backdrop-filter: blur(10px)}
.top-inner{max-width:1120px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;padding:14px 18px;gap:16px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;font-weight:950;letter-spacing:-.2px}
.brand-mark{width:10px;height:10px;border-radius:999px;background:linear-gradient(135deg,var(--accent),var(--accent2));box-shadow:0 0 0 6px rgba(37,99,235,0.10)}
.brand-text{font-size:16px}

.nav{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}
.nav-link{color:var(--muted);text-decoration:none;padding:8px 10px;border-radius:10px;font-weight:650}
.nav-link:hover{color:var(--text);background:rgba(15,23,42,0.04)}

.container{max-width:1120px;margin:0 auto;padding:28px 18px 56px}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;text-decoration:none;border:1px solid transparent;background:linear-gradient(135deg,var(--accent),var(--accent2));color:white;padding:10px 12px;border-radius:12px;font-weight:900;cursor:pointer;box-shadow:0 10px 24px rgba(37,99,235,0.18)}
.btn:hover{filter:brightness(1.03)}
.btn-ghost{background:transparent;color:var(--text);border-color:var(--border);box-shadow:none}
.btn-ghost:hover{background:rgba(15,23,42,0.04)}
.btn-full{width:100%}

.hero{border:1px solid var(--border);border-radius:18px;background:radial-gradient(700px 240px at 10% 10%, var(--accentSoft), transparent 60%),radial-gradient(700px 240px at 90% 10%, var(--accentSoft2), transparent 60%), var(--panel);box-shadow:var(--shadow);overflow:hidden}
.hero-inner{display:grid;grid-template-columns:1.05fr .95fr;gap:18px;padding:24px}
@media(max-width:980px){.hero-inner{grid-template-columns:1fr}}
.hero h1{margin:0 0 10px;font-size:42px;line-height:1.05;letter-spacing:-.8px}
.hero p{margin:0;color:var(--muted);font-size:15px;line-height:1.6}
.hero-cta{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
.micro{font-size:12px}

.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:18px}
@media(max-width:820px){.kpis{grid-template-columns:1fr}}
.kpi{border:1px solid var(--border);background:rgba(15,23,42,0.02);border-radius:16px;padding:12px}
.kpi b{display:block;font-size:15px}
.kpi .muted{font-size:12px}

.visual{border:1px solid var(--border);border-radius:16px;background:linear-gradient(180deg, rgba(15,23,42,0.03), rgba(15,23,42,0.01));padding:12px}
.window{border:1px solid var(--border);border-radius:14px;background:white;box-shadow:0 12px 30px rgba(15,23,42,0.10);overflow:hidden}
.win-top{display:flex;align-items:center;gap:8px;padding:10px;border-bottom:1px solid var(--border);background:rgba(15,23,42,0.02)}
.dot{width:10px;height:10px;border-radius:999px;background:rgba(15,23,42,0.14)}
.dot.red{background:#ff5f57}.dot.yellow{background:#febc2e}.dot.green{background:#28c840}
.win-body{padding:12px}
.mock-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
@media(max-width:980px){.mock-grid{grid-template-columns:1fr}}
.mock-card{border:1px solid var(--border);border-radius:14px;background:rgba(15,23,42,0.02);padding:10px}
.mock-card .title{font-weight:850;font-size:13px}
.mock-card .sub{color:var(--muted);font-size:12px;margin-top:4px}

.section{margin-top:24px}
.section h2{margin:0 0 10px;font-size:22px;letter-spacing:-.2px}
.muted{color:var(--muted)}

.feature-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
@media(max-width:980px){.feature-grid{grid-template-columns:1fr}}
.feature{border:1px solid var(--border);background:var(--card);border-radius:16px;padding:14px;box-shadow:0 12px 30px rgba(15,23,42,0.06)}
.icon{width:36px;height:36px;border-radius:12px;display:grid;place-items:center;background:var(--accentSoft);border:1px solid rgba(37,99,235,0.15);margin-bottom:10px;font-weight:900;color:var(--accent)}
.feature h3{margin:0 0 6px;font-size:14px}
.feature p{margin:0;color:var(--muted);font-size:13px;line-height:1.55}

.cta-strip{margin-top:24px;border:1px solid var(--border);border-radius:16px;background:linear-gradient(135deg, var(--accentSoft), rgba(15,23,42,0.02));padding:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.cta-actions{display:flex;gap:10px;flex-wrap:wrap}

.pricing{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
@media(max-width:1100px){.pricing{grid-template-columns:repeat(2,1fr)}}
@media(max-width:720px){.pricing{grid-template-columns:1fr}}
.pricing-card{border:1px solid var(--border);border-radius:18px;background:var(--card);padding:14px;box-shadow:var(--shadow)}
.pricing-card-featured{border-color:rgba(124,58,237,0.30)}
.badge{display:inline-flex;align-items:center;gap:8px;font-size:11px;color:var(--muted);border:1px solid var(--border);padding:4px 8px;border-radius:999px;background:rgba(15,23,42,0.02)}
.badge-accent{border-color:rgba(124,58,237,0.35);color:#4c1d95;background:rgba(124,58,237,0.08)}
.price{font-weight:950;font-size:24px;margin-top:10px}
.list{margin:10px 0 12px;padding-left:18px;color:var(--muted)}
.list li{margin:6px 0}

.table{width:100%;border-collapse:collapse;border:1px solid var(--border);border-radius:14px;overflow:hidden;background:white;box-shadow:0 12px 30px rgba(15,23,42,0.06)}
.table th,.table td{padding:12px;border-bottom:1px solid var(--border);text-align:left}
.table th{color:var(--muted);font-size:12px;background:rgba(15,23,42,0.02)}

.kbd{font-family: ui-monospace, Menlo, Consolas, monospace;background:rgba(15,23,42,0.02);border:1px solid var(--border);padding:2px 8px;border-radius:999px;color:#0b1220}

.panel{border:1px solid var(--border);border-radius:16px;background:white;padding:14px;box-shadow:0 12px 30px rgba(15,23,42,0.06)}
.notice{border:1px solid rgba(37,99,235,0.22);background:rgba(37,99,235,0.06);padding:12px;border-radius:14px}

.faq{display:grid;gap:10px}
.faq details{border:1px solid var(--border);border-radius:14px;background:white;padding:12px;box-shadow:0 12px 30px rgba(15,23,42,0.06)}
.faq summary{cursor:pointer;font-weight:850}
.faq p{margin:10px 0 0;color:var(--muted);line-height:1.6}

form{display:flex;flex-direction:column;gap:10px}
label{display:flex;flex-direction:column;gap:6px;color:var(--muted);font-size:12px}
input,select,textarea{background:white;border:1px solid var(--border);color:var(--text);padding:11px 12px;border-radius:12px;outline:none}
input:focus,select:focus,textarea:focus{border-color:rgba(37,99,235,0.45);box-shadow:0 0 0 4px rgba(37,99,235,0.12)}

.wallgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
@media(max-width:980px){.wallgrid{grid-template-columns:1fr}}
.item{border:1px solid var(--border);border-radius:16px;background:white;padding:10px;overflow:hidden;box-shadow:0 12px 30px rgba(15,23,42,0.06)}
.item .meta{color:var(--muted);font-size:12px;margin-top:8px}

.footer{border-top:1px solid var(--border);background:white}
.footer-inner{max-width:1120px;margin:0 auto;padding:16px 18px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start}
.footer-brand{font-weight:950}
pre{margin:0}
  `);
});

// ------------------------
// Marketing pages
// ------------------------

app.get("/", async (req, res) => {
  const user = authFromReq(req);

  const body = `
  <section class="hero">
    <div class="hero-inner">
      <div>
        <h1>Social proof op je site, automatisch.</h1>
        <p><b>feedr</b> verzamelt content van <b>Instagram</b>, <b>TikTok</b> en <b>YouTube</b> en toont het als een strakke social wall. Perfect voor marketeers, agencies en e-commerce teams die meer conversie willen.</p>
        <div class="hero-cta">
          <a class="btn" href="/signup">Start gratis</a>
          <a class="btn btn-ghost" href="/product">Bekijk demo</a>
        </div>
        <div class="micro muted" style="margin-top:10px">Geen creditcard nodig · Binnen 5 min live · Embed zonder iframe</div>

        <div class="kpis">
          <div class="kpi"><b>Embed zonder iframe</b><div class="muted">Voelt “native” op je website</div></div>
          <div class="kpi"><b>Multi-tenant</b><div class="muted">Elke klant/organisatie eigen omgeving</div></div>
          <div class="kpi"><b>NL-first</b><div class="muted">Copy, UI en support in het Nederlands</div></div>
        </div>
      </div>

      <div class="visual" aria-label="Product voorbeeld">
        <div class="window">
          <div class="win-top">
            <span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span>
            <span class="muted" style="font-size:12px;margin-left:8px">feedr · dashboard</span>
          </div>
          <div class="win-body">
            <div class="muted" style="font-size:12px;margin-bottom:10px">Organisatie: Bostainteriors · Wall: Showroom</div>
            <div class="mock-grid">
              <div class="mock-card"><div class="title">Instagram post</div><div class="sub">Nieuwe keuken opgeleverd · #interieur</div></div>
              <div class="mock-card"><div class="title">TikTok video</div><div class="sub">Before/after · 12k views</div></div>
              <div class="mock-card"><div class="title">YouTube</div><div class="sub">Project walkthrough · 4:12</div></div>
            </div>
            <div style="margin-top:10px" class="muted">Embed snippet → plakken → klaar</div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="section">
    <h2>Probleem → oplossing</h2>
    <div class="feature-grid">
      <div class="feature"><div class="icon">↗</div><h3>Meer vertrouwen</h3><p>Laat echte content zien waar bezoekers al op vertrouwen: social proof op je belangrijkste pagina’s.</p></div>
      <div class="feature"><div class="icon">⚡</div><h3>Snel live</h3><p>Maak een wall, voeg URLs toe en embed direct. Perfect voor campagnes en landingspagina’s.</p></div>
      <div class="feature"><div class="icon">🧩</div><h3>Past bij je site</h3><p>Geen iframe. Je embed voelt native en is makkelijk te stylen.</p></div>
    </div>
  </section>

  <section class="section">
    <h2>Hoe het werkt</h2>
    <div class="feature-grid">
      <div class="feature"><div class="icon">1</div><h3>Connect</h3><p>Kies je platform (Instagram/TikTok/YouTube) en voeg content toe via URL.</p></div>
      <div class="feature"><div class="icon">2</div><h3>Configure</h3><p>Beheer je wall, kies je layout en (later) moderatie & branding.</p></div>
      <div class="feature"><div class="icon">3</div><h3>Publish</h3><p>Plak de JavaScript snippet op je website en je wall staat live.</p></div>
    </div>
  </section>

  <section class="section">
    <h2>Use cases</h2>
    <div class="feature-grid">
      <div class="feature"><div class="icon">📣</div><h3>Marketing</h3><p>Meer conversie op landing pages met echte content.</p><div style="margin-top:10px"><a class="btn btn-ghost" href="/use-cases">Bekijk use cases</a></div></div>
      <div class="feature"><div class="icon">🛒</div><h3>E-commerce</h3><p>Social proof op product- en categoriepagina’s.</p><div style="margin-top:10px"><a class="btn btn-ghost" href="/use-cases">Bekijk use cases</a></div></div>
      <div class="feature"><div class="icon">🎪</div><h3>Events & locaties</h3><p>Laat sfeer zien: posts van bezoekers en creators.</p><div style="margin-top:10px"><a class="btn btn-ghost" href="/use-cases">Bekijk use cases</a></div></div>
    </div>
  </section>

  <section class="section">
    <h2>Prijzen</h2>
    <p class="muted">Start gratis. Later koppelen we Mollie en maken we Pro/Business live.</p>
    ${pricingCards()}
  </section>

  ${faqBlock()}

  ${ctaStrip()}
  `;

  res.send(
    layout({
      title: "",
      body,
      user,
      metaDescription:
        "feedr: maak social walls met Instagram, TikTok en YouTube. Start gratis en embed zonder iframe.",
    })
  );
});

app.get("/product", (req, res) => {
  const user = authFromReq(req);
  const body = `
  <section class="hero">
    <div class="hero-inner">
      <div>
        <h1>Product: van content naar conversie.</h1>
        <p>feedr helpt je om social content om te zetten in een duidelijke wall op je website. Je bezoekers zien echte projecten, echte mensen en echte resultaten.</p>
        <div class="hero-cta">
          <a class="btn" href="/signup">Start gratis</a>
          <a class="btn btn-ghost" href="/pricing">Zie prijzen</a>
        </div>
        <div class="micro muted" style="margin-top:10px">Geen creditcard nodig · Embed zonder iframe · Multi-tenant</div>
      </div>
      <div class="panel">
        <h3>Workflow</h3>
        <ol class="list">
          <li><b>Connect</b>: voeg Instagram/TikTok/YouTube URLs toe</li>
          <li><b>Configure</b>: beheer je wall in het dashboard</li>
          <li><b>Publish</b>: plak de embed snippet op je site</li>
        </ol>
      </div>
    </div>
  </section>

  <section class="section">
    <h2>Money features</h2>
    <div class="feature-grid">
      <div class="feature"><div class="icon">🧱</div><h3>Walls per klant</h3><p>Multi-tenant basis: elke organisatie zijn eigen walls en users.</p></div>
      <div class="feature"><div class="icon">🧷</div><h3>Embed snippet</h3><p>JavaScript embed zonder iframe. Snel te plaatsen, strak resultaat.</p></div>
      <div class="feature"><div class="icon">🛡</div><h3>Privacy mindset</h3><p>We houden het simpel: minimale data, duidelijke security pagina.</p></div>
    </div>
  </section>

  <section class="section">
    <div class="notice"><b>Roadmap:</b> echte API-koppelingen + automatische sync + moderatie + branding + Mollie billing.</div>
  </section>

  ${ctaStrip()}
  `;
  res.send(layout({ title: "Product", body, user }));
});

app.get("/use-cases", (req, res) => {
  const user = authFromReq(req);
  const body = `
  <section class="hero">
    <div class="hero-inner">
      <div>
        <h1>Use cases</h1>
        <p>feedr is gebouwd voor teams die snel duidelijkheid willen: wat is het, wat levert het op, en hoe starten we?</p>
        <div class="hero-cta">
          <a class="btn" href="/signup">Start gratis</a>
          <a class="btn btn-ghost" href="/product">Bekijk hoe het werkt</a>
        </div>
      </div>
      <div class="panel">
        <h3>Voor wie?</h3>
        <ul class="list">
          <li>Marketing teams</li>
          <li>Agencies</li>
          <li>E-commerce</li>
          <li>Events/locaties</li>
        </ul>
      </div>
    </div>
  </section>

  <section class="section">
    <h2>Voor marketing</h2>
    <div class="feature-grid">
      <div class="feature"><div class="icon">🎯</div><h3>Landing pages</h3><p>Meer vertrouwen vlak bij je primaire CTA door echte content te tonen.</p></div>
      <div class="feature"><div class="icon">📈</div><h3>Campagnes</h3><p>Combineer posts rond een thema en embed op campagnepagina’s.</p></div>
      <div class="feature"><div class="icon">⏱</div><h3>Snel itereren</h3><p>Nieuwe wall maken → content toevoegen → live. Geen dev-klus.</p></div>
    </div>
  </section>

  <section class="section">
    <h2>Voor e-commerce</h2>
    <div class="feature-grid">
      <div class="feature"><div class="icon">🛍</div><h3>Product pages</h3><p>Laat zien hoe het product in het echt gebruikt wordt.</p></div>
      <div class="feature"><div class="icon">🧠</div><h3>Trust dichtbij checkout</h3><p>Social proof bij de momenten dat mensen twijfelen.</p></div>
      <div class="feature"><div class="icon">🧩</div><h3>Past bij je design</h3><p>Embed zonder iframe = meer controle over uitstraling.</p></div>
    </div>
  </section>

  <section class="section">
    <h2>Voor agencies</h2>
    <div class="feature-grid">
      <div class="feature"><div class="icon">🏢</div><h3>Multi-tenant</h3><p>Elke klant zijn eigen organisatie en walls.</p></div>
      <div class="feature"><div class="icon">📦</div><h3>Snel opleveren</h3><p>Een extra upsell: social wall als module.</p></div>
      <div class="feature"><div class="icon">🧾</div><h3>Later billing</h3><p>Mollie abonnementen per klant (roadmap).</p></div>
    </div>
  </section>

  ${faqBlock()}
  ${ctaStrip()}
  `;
  res.send(layout({ title: "Use cases", body, user }));
});

app.get("/pricing", (req, res) => {
  const user = authFromReq(req);
  const body = `
  <section class="hero">
    <div class="hero-inner">
      <div>
        <h1>Prijzen</h1>
        <p>Start gratis. Upgrade later naar Pro/Business. Enterprise is mogelijk met SLA/SSO.</p>
        <div class="hero-cta">
          <a class="btn" href="/signup">Start gratis</a>
          <a class="btn btn-ghost" href="/product">Bekijk product</a>
        </div>
        <div class="micro muted" style="margin-top:10px">Transparant · geen verrassingen · cancel anytime (later bij billing)</div>
      </div>
      <div class="panel">
        <h3>Risk reducers</h3>
        <ul class="list">
          <li>Geen creditcard nodig (Gratis)</li>
          <li>SSL/HTTPS standaard</li>
          <li>Privacy-first mindset</li>
        </ul>
      </div>
    </div>
  </section>

  ${pricingCards()}

  <section class="section">
    <h2>Vergelijking (MVP)</h2>
    <table class="table">
      <thead><tr><th>Feature</th><th>Gratis</th><th>Pro</th><th>Business</th></tr></thead>
      <tbody>
        <tr><td>Walls</td><td>1</td><td>Meerdere</td><td>Meerdere</td></tr>
        <tr><td>Embed zonder iframe</td><td>Ja</td><td>Ja</td><td>Ja</td></tr>
        <tr><td>Branding</td><td>Basis</td><td>Uitgebreid</td><td>Uitgebreid</td></tr>
        <tr><td>Moderatie</td><td>Basis</td><td>Ja</td><td>Advanced</td></tr>
        <tr><td>Teams & rollen</td><td>-</td><td>-</td><td>Ja</td></tr>
      </tbody>
    </table>
    <p class="muted" style="margin-top:10px">Billing via Mollie en echte limits komen in de volgende fase.</p>
  </section>

  ${faqBlock()}
  ${ctaStrip()}
  `;
  res.send(layout({ title: "Prijzen", body, user }));
});

app.get("/security", (req, res) => {
  const user = authFromReq(req);
  const body = `
  <section class="hero">
    <div class="hero-inner">
      <div>
        <h1>Security & privacy</h1>
        <p>feedr is gebouwd met een simpele regel: verzamel zo min mogelijk data, bescherm wat je wél opslaat, en wees transparant.</p>
        <div class="hero-cta">
          <a class="btn" href="/signup">Start gratis</a>
          <a class="btn btn-ghost" href="mailto:willembotai@gmail.com">Contact</a>
        </div>
      </div>
      <div class="panel">
        <h3>In het kort</h3>
        <ul class="list">
          <li>HTTPS standaard (Let’s Encrypt)</li>
          <li>Wachtwoorden gehasht (bcrypt)</li>
          <li>Session via HTTP-only cookie</li>
        </ul>
      </div>
    </div>
  </section>

  <section class="section">
    <h2>Wat we opslaan (MVP)</h2>
    <div class="feature-grid">
      <div class="feature"><div class="icon">👤</div><h3>Account</h3><p>E-mail + wachtwoordhash (geen plaintext wachtwoorden).</p></div>
      <div class="feature"><div class="icon">🏢</div><h3>Organisatie</h3><p>Naam + planstatus (bijv. free).</p></div>
      <div class="feature"><div class="icon">🧱</div><h3>Walls</h3><p>Wall naam/slug + bronnen/URLs die je toevoegt.</p></div>
    </div>
  </section>

  <section class="section">
    <div class="notice"><b>Let op:</b> dit is een MVP. Als we richting echte klanten gaan, voegen we o.a. audit logging, rate limiting en duidelijke data retention toe.</div>
  </section>

  ${ctaStrip()}
  `;
  res.send(layout({ title: "Security", body, user }));
});

// Backwards compat link
app.get("/features", (req, res) => res.redirect(302, "/product"));

// ------------------------
// Auth + app
// ------------------------

app.get("/signup", (req, res) => {
  const user = authFromReq(req);
  const body = `
  <section class="hero">
    <div class="hero-inner">
      <div>
        <h1>Start gratis</h1>
        <p>Maak een organisatie aan. Daarna maak je je eerste wall en embed je direct op je website.</p>
        <div class="micro muted" style="margin-top:10px">Geen creditcard nodig · Binnen 5 minuten live</div>
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
    <div class="hero-inner">
      <div>
        <h1>Inloggen</h1>
        <p>Welkom terug. Ga naar je dashboard om je walls te beheren.</p>
      </div>
      <div class="panel">
        <form method="post" action="/login">
          <label>E-mail<input name="email" type="email" required /></label>
          <label>Wachtwoord<input name="password" type="password" required /></label>
          <button class="btn btn-full" type="submit">Inloggen</button>
        </form>
        <p class="muted" style="margin-top:10px;font-size:12px">Nog geen account? <a href="/signup">Start gratis</a></p>
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
    <div class="hero-inner">
      <div>
        <h1>Dashboard</h1>
        <p class="muted">Organisatie: <b>${escapeHtml(org?.name || "-")}</b> · Plan: <b>${escapeHtml(org?.plan || "free")}</b></p>
        <div class="hero-cta">
          <a class="btn" href="/dashboard/new-wall">+ Nieuwe wall</a>
          <a class="btn btn-ghost" href="/product">Product</a>
        </div>
      </div>
      <div class="panel">
        <h3>Volgende stap</h3>
        <p class="muted">Open een wall, voeg een paar URLs toe en pak daarna de embed snippet.</p>
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
    <div class="hero-inner">
      <div>
        <h1>Nieuwe wall</h1>
        <p class="muted">Maak een nieuwe wall aan voor een pagina, campagne of klant.</p>
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

  const embedSnippet = `\n<script>\n  (function(){\n    var s=document.createElement('script');\n    s.src='${APP_BASE_URL}/widget/feedr.js?wall=${encodeURIComponent(wall.slug)}';\n    s.async=true;\n    document.currentScript.parentNode.insertBefore(s, document.currentScript);\n  })();\n</script>\n<div data-feedr-wall=\"${escapeHtml(wall.slug)}\"></div>`;

  const body = `
  <section class="hero">
    <div class="hero-inner">
      <div>
        <h1>${escapeHtml(wall.name)}</h1>
        <p class="muted">Publieke URL: <a href="/w/${encodeURIComponent(wall.slug)}" target="_blank" rel="noopener">${escapeHtml(APP_BASE_URL)}/w/${escapeHtml(wall.slug)}</a></p>
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
      <p class="muted" style="margin-top:10px;font-size:12px">MVP: via URL/oEmbed (best effort). Automatische sync via API komt later.</p>
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
    <div class="hero-inner">
      <div>
        <h1>${escapeHtml(wall.name)}</h1>
        <p class="muted">feedr wall · ${items.length} items</p>
      </div>
      <div class="panel">
        <h3>Wil je dit ook?</h3>
        <p class="muted">Maak gratis een account en embed jouw wall op je site.</p>
        <a class="btn btn-full" href="/signup">Start gratis</a>
        <div class="micro muted" style="margin-top:10px">Geen creditcard nodig</div>
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

  ${ctaStrip()}
  `;

  res.send(layout({ title: wall.name, body, user: authFromReq(req) }));
});

// JSON API for widgets
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

// Widget script (no iframe)
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
        border:'1px solid rgba(15,23,42,0.10)',
        borderRadius:'16px',
        padding:'10px',
        background:'#fff',
        color:'#0b1220',
        overflow:'hidden',
        boxShadow:'0 12px 30px rgba(15,23,42,0.06)'
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
