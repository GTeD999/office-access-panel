import { readFile } from "fs/promises";
import path from "path";
import type { CredentialEntry } from "./credentials-types";

const CREDENTIALS_FILE = path.join(process.cwd(), ".data", "credentials.json");

export type MikrotikOpenTarget = {
  id: string;
  label: string;
  baseUrl: string;
  username: string;
  password: string;
};

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/$/, "");
}

const ENV_HOSTS: Record<string, string | undefined> = {
  "mt-sov95": process.env.MIKROTIK_HOST,
  "mt-sov36": process.env.MIKROTIK_SOV36_HOST,
  "mt-line27": process.env.MIKROTIK_LINE27_HOST,
};

export async function getMikrotikOpenTarget(id: string): Promise<MikrotikOpenTarget | null> {
  let entries: CredentialEntry[] = [];

  try {
    const raw = await readFile(CREDENTIALS_FILE, "utf-8");
    const store = JSON.parse(raw) as {
      categories?: Array<{ id: string; entries: CredentialEntry[] }>;
    };
    const mikrotik = store.categories?.find((c) => c.id === "mikrotik");
    entries = mikrotik?.entries ?? [];
  } catch {
    return null;
  }

  const entry = entries.find((e) => e.id === id);
  if (!entry?.username || !entry.password) return null;

  const baseUrl = normalizeBaseUrl(
    entry.url ?? (entry.host ? `http://${entry.host}` : ENV_HOSTS[id]) ?? "",
  );

  if (!baseUrl) return null;

  return {
    id: entry.id,
    label: entry.label,
    baseUrl,
    username: entry.username,
    password: entry.password,
  };
}

export function gatewayPrefix(id: string): string {
  return `/api/mikrotik/gateway/${encodeURIComponent(id)}`;
}

export function rewriteRouterHtml(
  html: string,
  prefix: string,
  injectScript?: string,
): string {
  let out = html
    .replace(/href="\/(?!\/)/g, `href="${prefix}/`)
    .replace(/src="\/(?!\/)/g, `src="${prefix}/`)
    .replace(/action="\/(?!\/)/g, `action="${prefix}/`)
    .replace(/location\.href\s*=\s*"\/webfig\/?"/g, `location.href="${prefix}/webfig/"`)
    .replace(/location\.replace\(\s*"\/webfig/g, `location.replace("${prefix}/webfig`);

  if (injectScript) {
    out = out.includes("</body>")
      ? out.replace("</body>", `<script>${injectScript}</script></body>`)
      : `${out}<script>${injectScript}</script>`;
  }

  return out;
}

export function buildAutoLoginScript(prefix: string, username: string, password: string): string {
  const user = JSON.stringify(username);
  const pass = JSON.stringify(password);
  const target = JSON.stringify(`${prefix}/webfig/`);

  return `
(function () {
  try {
    sessionStorage.setItem("name", ${user});
    sessionStorage.setItem("password", ${pass});
    window.location.replace(${target});
  } catch (e) {
    console.error(e);
  }
})();
`.trim();
}

export async function proxyToMikrotik(
  target: MikrotikOpenTarget,
  subPath: string,
  request: Request,
): Promise<Response> {
  const pathPart = subPath ? `/${subPath}` : "/";
  const url = `${target.baseUrl}${pathPart}${new URL(request.url).search}`;

  const headers = new Headers();
  const accept = request.headers.get("accept");
  if (accept) headers.set("Accept", accept);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  headers.set("User-Agent", "Mozilla/5.0 (compatible; NovactivAccess/1.0)");

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(url, init);
  const prefix = gatewayPrefix(target.id);
  const responseHeaders = new Headers();

  const upstreamType = upstream.headers.get("content-type") ?? "";
  responseHeaders.set("content-type", upstreamType);

  const location = upstream.headers.get("location");
  if (location) {
    if (location.startsWith("/")) {
      responseHeaders.set("location", `${prefix}${location}`);
    } else if (location.startsWith(target.baseUrl)) {
      responseHeaders.set("location", location.replace(target.baseUrl, prefix));
    } else {
      responseHeaders.set("location", location);
    }
  }

  if (request.method === "HEAD") {
    return new Response(null, { status: upstream.status, headers: responseHeaders });
  }

  if (upstreamType.includes("text/html")) {
    const html = await upstream.text();
    const isLogin =
      html.includes('id="login"') || html.includes("id='login'") || pathPart === "/";
    const inject =
      isLogin && request.method === "GET" && !subPath.startsWith("webfig")
        ? buildAutoLoginScript(prefix, target.username, target.password)
        : undefined;

    return new Response(rewriteRouterHtml(html, prefix, inject), {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  const body = upstream.body;
  return new Response(body, { status: upstream.status, headers: responseHeaders });
}
