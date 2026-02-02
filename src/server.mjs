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
  db.data ||= { users: [], orgs: [], walls: [], sources: [], items: [], meta: { createdAt: new Date().toISOString(), version: 1 } };
}
async function dbWrite() {
  await db.write();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function layout({ title, body, user }) {
  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} - feedr</title>
  <link rel="stylesheet" href="/assets/app.css" />
</head>
<body>
  <header class="top">
    <a class="brand" href="/">feedr</a>
    <nav class="nav">
      ${user ? `<a href="/dashboard">Dashboard</a><a href="/logout">Uitloggen</a>` : `<a href="/login">Inloggen</a><a class="btn" href="/signup">Gratis starten</a>`}
    </nav>
  </header>
  <main class="container">${body}</main>
  <footer class="footer">© ${new Date().getFullYear()} feedr</footer>
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

function pickPlanCopy() {
  return `
  <section class="cards">
    <div class="card"><h3>Gratis</h3><p>Start met 1 wall en basis features.</p><p class="price">€0</p></div>
    <div class="card"><h3>Pro</h3><p>Meer walls, meer items en branding opties.</p><p class="price">Binnenkort</p></div>
    <div class="card"><h3>Business</h3><p>Teams, rollen en betere moderatie.</p><p class="price">Binnenkort</p></div>
    <div class="card"><h3>Enterprise</h3><p>SLA, SSO en maatwerk integraties.</p><p class="price">Op aanvraag</p></div>
  </section>`;
}

const app = express();
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/assets/app.css", (req, res) => {
  res.type("text/css").send(`
:root{--bg:#0f1115;--panel:#151a22;--card:#1b2230;--text:#e8eefc;--muted:#9aa7c0;--border:#2a3447;--accent:#6aa6ff;}
*{box-sizing:border-box} body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;background:var(--bg);color:var(--text)}
a{color:var(--text);text-decoration:none} a:hover{text-decoration:underline}
.top{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid var(--border);position:sticky;top:0;background:linear-gradient(180deg,#121620,#0f1115)}
.brand{font-weight:900} .nav{display:flex;gap:12px;align-items:center}
.btn{background:var(--accent);color:#06101f;padding:8px 10px;border-radius:10px;font-weight:800}
.container{padding:18px;max-width:980px;margin:0 auto}
.hero{padding:18px;border:1px solid var(--border);border-radius:14px;background:var(--panel)}
.hero h1{margin:0 0 8px;font-size:28px} .muted{color:var(--muted)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:900px){.grid2{grid-template-columns:1fr}}
.card{border:1px solid var(--border);background:var(--card);border-radius:14px;padding:14px}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:14px}
@media(max-width:1100px){.cards{grid-template-columns:repeat(2,1fr)}}
@media(max-width:700px){.cards{grid-template-columns:1fr}}
.price{font-weight:900}
form{display:flex;flex-direction:column;gap:10px} input,select,textarea{background:#0b0d12;border:1px solid var(--border);color:var(--text);padding:10px;border-radius:10px}
label{display:flex;flex-direction:column;gap:6px;color:var(--muted);font-size:12px}
.row{display:flex;gap:10px;flex-wrap:wrap}
.table{width:100%;border-collapse:collapse} .table td,.table th{border-bottom:1px solid var(--border);padding:10px;text-align:left}
.kbd{font-family:ui-monospace,Menlo,Consolas,monospace;background:#0b0d12;border:1px solid var(--border);padding:2px 6px;border-radius:8px}
.footer{padding:18px;color:var(--muted);text-align:center}
.notice{border:1px solid rgba(106,166,255,.35);background:rgba(106,166,255,.08);padding:10px;border-radius:12px}
.wall{border:1px solid var(--border);border-radius:14px;overflow:hidden}
.wallhead{display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--panel);border-bottom:1px solid var(--border)}
.wallgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:12px}
@media(max-width:900px){.wallgrid{grid-template-columns:1fr}}
.item{border:1px solid var(--border);border-radius:12px;background:var(--card);padding:10px;overflow:hidden}
.item .meta{color:var(--muted);font-size:12px;margin-top:8px}
  `);
});

app.get("/", async (req, res) => {
  const user = authFromReq(req);
  const body = `
  <section class="hero">
    <h1>Social feeds, netjes op je website.</h1>
    <p class="muted">feedr verzamelt content en toont het als een mooie wall. Volledig in het Nederlands.</p>
    <div class="row">
      <a class="btn" href="/signup">Gratis starten</a>
      <a href="/features">Features</a>
      <a href="/pricing">Prijzen</a>
    </div>
  </section>
  <div class="grid2" style="margin-top:14px">
    <div class="card"><h3>Multi-tenant</h3><p class="muted">Elke organisatie heeft eigen walls en instellingen.</p></div>
    <div class="card"><h3>Embed zonder iframe</h3><p class="muted">Gebruik onze JavaScript snippet om je wall te plaatsen.</p></div>
  </div>
  ${pickPlanCopy()}
  `;
  res.send(layout({ title: "Home", body, user }));
});

app.get("/features", (req, res) => {
  const user = authFromReq(req);
  const body = `
  <h1>Features</h1>
  <ul>
    <li>Walls (Todo/Doing/Done-achtige) — maar dan voor content</li>
    <li>Moderatie (in MVP basic)</li>
    <li>Publieke wall pagina</li>
    <li>Embed code (JavaScript)</li>
    <li>Bronnen: Instagram / TikTok / YouTube via URL toevoegen (oEmbed waar mogelijk)</li>
  </ul>
  <p class="notice">Let op: API-koppelingen (automatisch syncen) komen later. Dit MVP focust op snel live gaan.</p>
  `;
  res.send(layout({ title: "Features", body, user }));
});

app.get("/pricing", (req, res) => {
  const user = authFromReq(req);
  const body = `<h1>Prijzen</h1><p class="muted">We starten met een gratis plan. Betalingen (Mollie) koppelen we later.</p>${pickPlanCopy()}`;
  res.send(layout({ title: "Prijzen", body, user }));
});

app.get("/signup", (req, res) => {
  const user = authFromReq(req);
  const body = `
  <h1>Gratis starten</h1>
  <form method="post" action="/signup">
    <label>Organisatienaam<input name="orgName" required /></label>
    <label>E-mail<input name="email" type="email" required /></label>
    <label>Wachtwoord<input name="password" type="password" minlength="8" required /></label>
    <button class="btn" type="submit">Account aanmaken</button>
  </form>`;
  res.send(layout({ title: "Registreren", body, user }));
});

app.post("/signup", async (req, res) => {
  await dbRead();
  const orgName = String(req.body.orgName || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!orgName || !email || password.length < 8) return res.status(400).send("Ongeldige invoer.");
  if (db.data.users.some((u) => u.email === email)) return res.status(400).send("E-mail bestaat al.");

  const org = { id: nanoid(), name: orgName, plan: "free", createdAt: new Date().toISOString() };
  const user = { id: nanoid(), orgId: org.id, email, passwordHash: await bcrypt.hash(password, 10), createdAt: new Date().toISOString() };
  db.data.orgs.push(org);
  db.data.users.push(user);

  // default wall
  const wall = { id: nanoid(), orgId: org.id, name: "Mijn eerste wall", slug: `mijn-wall-${Math.floor(Math.random() * 10000)}`, createdAt: new Date().toISOString() };
  db.data.walls.push(wall);

  await dbWrite();

  const token = jwt.sign({ userId: user.id, orgId: org.id, email: user.email }, JWT_SECRET, { expiresIn: "30d" });
  res.cookie("session", token, { httpOnly: true, sameSite: "lax" });
  res.redirect("/dashboard");
});

app.get("/login", (req, res) => {
  const user = authFromReq(req);
  const body = `
  <h1>Inloggen</h1>
  <form method="post" action="/login">
    <label>E-mail<input name="email" type="email" required /></label>
    <label>Wachtwoord<input name="password" type="password" required /></label>
    <button class="btn" type="submit">Inloggen</button>
  </form>`;
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
  <td>${escapeHtml(w.name)}</td>
  <td><span class="kbd">${escapeHtml(w.slug)}</span></td>
  <td><a href="/w/${encodeURIComponent(w.slug)}" target="_blank">Open wall</a></td>
  <td><a href="/dashboard/walls/${encodeURIComponent(w.id)}">Beheer</a></td>
</tr>`
    )
    .join("");

  const body = `
  <h1>Dashboard</h1>
  <p class="muted">Organisatie: <b>${escapeHtml(org?.name || "-")}</b> · Plan: <b>${escapeHtml(org?.plan || "free")}</b></p>
  <div class="row">
    <a class="btn" href="/dashboard/new-wall">+ Nieuwe wall</a>
  </div>
  <h2 style="margin-top:16px">Jouw walls</h2>
  <table class="table">
    <thead><tr><th>Naam</th><th>Slug</th><th>Publiek</th><th>Beheer</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="4" class="muted">Nog geen walls.</td></tr>`}</tbody>
  </table>
  `;

  res.send(layout({ title: "Dashboard", body, user: req.user }));
});

app.get("/dashboard/new-wall", requireAuth, (req, res) => {
  const body = `
  <h1>Nieuwe wall</h1>
  <form method="post" action="/dashboard/new-wall">
    <label>Naam<input name="name" required /></label>
    <label>Slug (in URL)<input name="slug" placeholder="bijv. showroom" required /></label>
    <button class="btn" type="submit">Aanmaken</button>
  </form>
  <p class="muted">Tip: slug mag alleen letters, cijfers en streepjes.</p>
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

  const wall = { id: nanoid(), orgId: req.user.orgId, name, slug, createdAt: new Date().toISOString() };
  db.data.walls.push(wall);
  await dbWrite();
  res.redirect(`/dashboard/walls/${wall.id}`);
});

app.get("/dashboard/walls/:id", requireAuth, async (req, res) => {
  await dbRead();
  const wall = db.data.walls.find((w) => w.id === req.params.id && w.orgId === req.user.orgId);
  if (!wall) return res.status(404).send("Niet gevonden.");

  const sources = db.data.sources.filter((s) => s.wallId === wall.id);
  const items = db.data.items.filter((it) => it.wallId === wall.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const srcRows = sources
    .map(
      (s) => `<tr><td>${escapeHtml(s.type)}</td><td>${escapeHtml(s.url)}</td><td>${escapeHtml(s.status || "ok")}</td></tr>`
    )
    .join("");

  const embed = `
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
  <h1>Beheer: ${escapeHtml(wall.name)}</h1>
  <p class="muted">Publieke URL: <a href="/w/${encodeURIComponent(wall.slug)}" target="_blank">${APP_BASE_URL}/w/${escapeHtml(wall.slug)}</a></p>

  <h2>Content toevoegen</h2>
  <form method="post" action="/dashboard/walls/${encodeURIComponent(wall.id)}/add-url">
    <label>Type
      <select name="type">
        <option value="youtube">YouTube</option>
        <option value="tiktok">TikTok</option>
        <option value="instagram">Instagram</option>
      </select>
    </label>
    <label>URL (video/post)
      <input name="url" placeholder="https://..." required />
    </label>
    <button class="btn" type="submit">Toevoegen</button>
  </form>
  <p class="notice">In deze MVP voeg je content toe via URLs. Automatisch syncen via API koppelingen komt later.</p>

  <h2 style="margin-top:16px">Bronnen</h2>
  <table class="table"><thead><tr><th>Type</th><th>URL</th><th>Status</th></tr></thead><tbody>${srcRows || `<tr><td colspan="3" class="muted">Nog geen bronnen.</td></tr>`}</tbody></table>

  <h2 style="margin-top:16px">Embed code (JavaScript)</h2>
  <p class="muted">Plak dit in je website waar je de wall wil tonen:</p>
  <pre class="card" style="white-space:pre-wrap;overflow:auto">${escapeHtml(embed)}</pre>

  <h2 style="margin-top:16px">Voorbeeld items (${items.length})</h2>
  <div class="wallgrid">
    ${items
      .slice(0, 9)
      .map(
        (it) => `<div class="item"><div>${it.html || `<a href="${escapeHtml(it.url)}" target="_blank">Open</a>`}</div><div class="meta">${escapeHtml(it.provider || it.type)} · ${escapeHtml(new Date(it.createdAt).toLocaleString('nl-NL'))}</div></div>`
      )
      .join("") || `<div class="muted">Nog geen items.</div>`}
  </div>
  `;

  res.send(layout({ title: `Wall ${wall.name}`, body, user: req.user }));
});

async function resolveEmbed({ type, url }) {
  const u = String(url).trim();
  if (!u) throw new Error("URL ontbreekt");

  // Basic oEmbed endpoints
  // YouTube: https://www.youtube.com/oembed?url=...&format=json
  // TikTok: https://www.tiktok.com/oembed?url=...
  // Instagram: requires access token for oEmbed in many cases; we will fallback.

  if (type === "youtube") {
    const o = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}`).then((r) => r.ok ? r.json() : null);
    if (o?.html) return { provider: "YouTube", title: o.title || "", html: o.html };
  }

  if (type === "tiktok") {
    const o = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(u)}`).then((r) => r.ok ? r.json() : null);
    if (o?.html) return { provider: "TikTok", title: o.title || "", html: o.html };
  }

  if (type === "instagram") {
    // Instagram oEmbed often requires auth; try public endpoint as best-effort
    const o = await fetch(`https://api.instagram.com/oembed?url=${encodeURIComponent(u)}`).then((r) => r.ok ? r.json() : null);
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

  const src = { id: nanoid(), wallId: wall.id, type, url, status: "ok", createdAt: new Date().toISOString() };
  db.data.sources.push(src);

  let embed;
  try {
    embed = await resolveEmbed({ type, url });
  } catch (e) {
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
    createdAt: new Date().toISOString(),
  };
  db.data.items.push(item);
  await dbWrite();

  res.redirect(`/dashboard/walls/${wall.id}`);
});

// Public wall page
app.get("/w/:slug", async (req, res) => {
  await dbRead();
  const wall = db.data.walls.find((w) => w.slug === req.params.slug);
  if (!wall) return res.status(404).send("Niet gevonden.");

  const items = db.data.items.filter((it) => it.wallId === wall.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const body = `
  <div class="wall">
    <div class="wallhead"><div><b>${escapeHtml(wall.name)}</b><div class="muted">feedr wall</div></div><div class="muted">${items.length} items</div></div>
    <div class="wallgrid">
      ${items
        .map(
          (it) => `<div class="item"><div>${it.html || `<a href="${escapeHtml(it.url)}" target="_blank">Open</a>`}</div><div class="meta">${escapeHtml(it.provider || it.type)}</div></div>`
        )
        .join("") || `<div class="muted">Nog geen items.</div>`}
    </div>
  </div>`;

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
  function render(container, data){
    container.innerHTML='';
    var wrap=document.createElement('div');
    wrap.style.display='grid';
    wrap.style.gridTemplateColumns='repeat(3,minmax(0,1fr))';
    wrap.style.gap='10px';
    wrap.style.fontFamily='system-ui,-apple-system,Segoe UI,Roboto,Arial';
    if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) {
      wrap.style.gridTemplateColumns='1fr';
    }
    (data.items||[]).forEach(function(it){
      var card=document.createElement('div');
      card.style.border='1px solid rgba(42,52,71,1)';
      card.style.borderRadius='12px';
      card.style.padding='10px';
      card.style.background='rgba(27,34,48,1)';
      card.style.color='#e8eefc';
      card.innerHTML = it.html ? it.html : '<a href="'+it.url+'" target="_blank" rel="noopener">Open</a>';
      wrap.appendChild(card);
    });
    container.appendChild(wrap);
  }
  function boot(){
    var container=document.querySelector('[data-feedr-wall="'+slug+'"]');
    if(!container) return;
    fetch(host+'/api/walls/'+encodeURIComponent(slug)+'/items').then(function(r){return r.json()}).then(function(data){render(container,data)});
  }
  boot();
})();
  `);
});

app.listen(PORT, () => {
  console.log(`feedr draait op ${APP_BASE_URL}`);
});
