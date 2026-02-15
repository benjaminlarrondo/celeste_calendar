# cloudflare-worker (calendar-api)

## Opción UI (como en tu imagen)
1. Cloudflare -> Compute -> Workers & Pages -> Create -> **Start with Hello World!**
2. Nombra el worker: `calendar-api`.
3. Entra a **Edit code** y reemplaza con `src/index.js` de esta carpeta.
4. En **Settings -> Variables** agrega:
   - `GH_OWNER`
   - `GH_REPO` = `celeste_calendar`
   - `GH_BRANCH` = `main`
   - `ALLOWED_ORIGIN` = `https://TU_USUARIO.github.io`
5. En **Settings -> Variables -> Secrets** agrega `GH_TOKEN` (GitHub token con Contents read/write).
6. Deploy.

## Opción CLI
```bash
cd cloudflare-worker
npx wrangler login
npx wrangler secret put GH_TOKEN
npx wrangler deploy
```

## Endpoints
- GET `/health`
- GET `/latest`
- GET `/versions`
- POST `/save` body: `{ "year": 2026, "days": { ... }, "saved_by": "benja" }`
- POST `/restore` body: `{ "versionPath": "data/versions/state_YYYYMMDD_HHMMSS.json" }`
