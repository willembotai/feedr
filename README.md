# feedr

Een eenvoudige SaaS (MVP) voor het verzamelen en tonen van social feeds als een **"wall"**.

## MVP scope
- Volledig Nederlandstalige UI
- Multi-tenant (per organisatie)
- Inloggen (e-mail + wachtwoord)
- Walls aanmaken
- Content toevoegen via URLs (oEmbed waar mogelijk)
- Publieke wall pagina
- **Embed code (JavaScript, geen iframe)**

> Let op: Instagram/TikTok/YouTube hebben beperkingen qua API's. In deze MVP werken we primair met **oEmbed/URL-toevoegen**. Uitbreiding naar echte API-koppelingen volgt later.

## Lokale run

```bash
npm install
npm run dev
```

Open:
- http://localhost:3001

## Config

Environment variables:
- `PORT` (default 3001)
- `APP_BASE_URL` (default http://localhost:3001)
- `JWT_SECRET` (required in productie)

Data wordt opgeslagen in `data/db.json` (gitignored).
