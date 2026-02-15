# Paso a paso rápido (Cloudflare UI + GitHub)

1. Sube manualmente a GitHub estos archivos/carpetas:
   - `index.html`
   - `archivo_base.json`
   - `data/latest.json`
   - `data/versions/state_initial.json`
   - `cloudflare-worker/wrangler.toml`
   - `cloudflare-worker/src/index.js`

2. En Cloudflare, opción de tu imagen: **Start with Hello World!**.
3. Copia el contenido de `cloudflare-worker/src/index.js` en el editor del worker.
4. Configura variables y secret en Cloudflare (según `cloudflare-worker/README.md`).
5. Deploy y copia la URL `workers.dev`.
6. Luego conectas esa URL en el frontend para guardar/restaurar online en GitHub.
