export default {
  async fetch(request, env) {
    try {
      const origin = request.headers.get("Origin") || "";
      const corsOk = origin === env.ALLOWED_ORIGIN || origin === "";
      const cors = corsOk
        ? {
            "Access-Control-Allow-Origin": origin || env.ALLOWED_ORIGIN,
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          }
        : {};

      if (request.method === "OPTIONS") return new Response(null, { headers: cors });
      if (!corsOk) return json({ error: "Origin no permitido" }, 403, cors);

      const url = new URL(request.url);

      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
        return json({ ok: true, service: "calendar-api" }, 200, cors);
      }

      if (request.method === "GET" && url.pathname === "/latest") {
        const latest = await ghGetJson(env, "data/latest.json");
        const state = await ghGetJson(env, latest.current);
        return json({ latest, state }, 200, cors);
      }

      if (request.method === "POST" && url.pathname === "/save") {
        const body = await request.json();
        const stamp = filenameStamp(new Date());
        const versionPath = `data/versions/state_${stamp}.json`;
        const nowIso = new Date().toISOString();

        const state = {
          version: 1,
          year: body.year,
          days: body.days || {},
          meta: {
            saved_at: nowIso,
            saved_by: body.saved_by || "web",
            source: "cloudflare-worker",
          },
        };

        await ghPutJson(env, versionPath, state, `save: ${versionPath}`);
        const latest = { current: versionPath, updated_at: nowIso };
        await ghPutJson(env, "data/latest.json", latest, `save: update latest -> ${versionPath}`);

        return json({ ok: true, latest, versionPath }, 200, cors);
      }

      if (request.method === "POST" && url.pathname === "/restore") {
        const body = await request.json();
        if (!body.versionPath) return json({ error: "versionPath requerido" }, 400, cors);

        await ghGetJson(env, body.versionPath);
        const nowIso = new Date().toISOString();
        const latest = { current: body.versionPath, updated_at: nowIso };
        await ghPutJson(env, "data/latest.json", latest, `restore: ${body.versionPath}`);

        return json({ ok: true, latest }, 200, cors);
      }

      if (request.method === "GET" && url.pathname === "/versions") {
        const tree = await ghListTree(env);
        const versions = tree
          .filter((item) => item.path.startsWith("data/versions/") && item.path.endsWith(".json"))
          .map((item) => item.path)
          .sort()
          .reverse();
        return json({ versions }, 200, cors);
      }

      return json({ error: "Not found" }, 404, cors);
    } catch (e) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: String(e?.message || e),
          hint: "Revisa GH_OWNER, GH_REPO, GH_BRANCH, GH_TOKEN y archivos data/latest.json + data/versions/state_initial.json",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  },
};

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function ghHeaders(env, extra = {}) {
  return {
    Authorization: `Bearer ${env.GH_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "calendar-api-worker",
    "X-GitHub-Api-Version": "2022-11-28",
    ...extra,
  };
}

function filenameStamp(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${day}_${h}${min}${s}`;
}

async function ghGetJson(env, path) {
  const url = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/contents/${path}?ref=${env.GH_BRANCH}`;
  const res = await fetch(url, { headers: ghHeaders(env) });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub GET ${path} -> ${res.status}: ${err}`);
  }
  const data = await res.json();
  return JSON.parse(decodeBase64Utf8(data.content));
}

async function ghPutJson(env, path, obj, message) {
  const getUrl = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/contents/${path}?ref=${env.GH_BRANCH}`;
  let sha;
  const getRes = await fetch(getUrl, { headers: ghHeaders(env) });
  if (getRes.ok) {
    const existing = await getRes.json();
    sha = existing.sha;
  }

  const putUrl = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/contents/${path}`;
  const body = {
    message,
    content: encodeBase64Utf8(JSON.stringify(obj, null, 2)),
    branch: env.GH_BRANCH,
    ...(sha ? { sha } : {}),
  };

  const putRes = await fetch(putUrl, {
    method: "PUT",
    headers: ghHeaders(env, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  if (!putRes.ok) {
    const err = await putRes.text();
    throw new Error(`GitHub PUT ${path} -> ${putRes.status}: ${err}`);
  }
}

async function ghListTree(env) {
  const refUrl = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/git/ref/heads/${env.GH_BRANCH}`;
  const refRes = await fetch(refUrl, { headers: ghHeaders(env) });
  if (!refRes.ok) throw new Error(`No se pudo leer branch ${env.GH_BRANCH}`);
  const ref = await refRes.json();
  const commitSha = ref.object.sha;

  const commitUrl = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/git/commits/${commitSha}`;
  const commitRes = await fetch(commitUrl, { headers: ghHeaders(env) });
  if (!commitRes.ok) throw new Error("No se pudo leer commit del branch");
  const commit = await commitRes.json();
  const treeSha = commit.tree.sha;

  const treeUrl = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/git/trees/${treeSha}?recursive=1`;
  const treeRes = await fetch(treeUrl, { headers: ghHeaders(env) });
  if (!treeRes.ok) throw new Error("No se pudo listar árbol del repo");
  const tree = await treeRes.json();
  return tree.tree || [];
}

function encodeBase64Utf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function decodeBase64Utf8(str) {
  return decodeURIComponent(escape(atob((str || "").replace(/\n/g, ""))));
}
