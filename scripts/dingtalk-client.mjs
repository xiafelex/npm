import { env, requireEnv } from "./env.mjs";

const DINGTALK_API = "https://api.dingtalk.com";
const DINGTALK_OAPI = "https://oapi.dingtalk.com";

let openTokenCache;
let legacyTokenCache;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
  const timeoutMs = Number(process.env.DINGTALK_REQUEST_TIMEOUT_MS || "30000");
  const maxRetries = Number(process.env.DINGTALK_RETRY_LIMIT || "3");
  const retryDelayMs = Number(process.env.DINGTALK_RETRY_DELAY_MS || "1500");

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(options.headers ?? {})
      }
    }).finally(() => clearTimeout(timeout));
    const text = await response.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { message: text };
    }

    if (!response.ok || body.errcode || body.code) {
      const detail = body.errmsg || body.message || text || response.statusText;
      const shouldRetry =
        attempt < maxRetries
        && (
          response.status === 429
          || /qps/i.test(detail)
          || /请求被暂时限制/.test(detail)
          || /调用该接口次数过多/.test(detail)
        );
      if (shouldRetry) {
        const waitMs = retryDelayMs * (attempt + 1);
        console.warn(`DingTalk rate limited, retrying in ${waitMs}ms: ${detail}`);
        await sleep(waitMs);
        continue;
      }
      throw new Error(`${options.method ?? "GET"} ${url} failed: ${detail}`);
    }
    return body;
  }
  throw new Error(`${options.method ?? "GET"} ${url} failed after retries.`);
}

export async function getOpenAccessToken() {
  if (openTokenCache) return openTokenCache;
  requireEnv(["DINGTALK_APP_KEY", "DINGTALK_APP_SECRET"]);
  const body = await fetchJson(`${DINGTALK_API}/v1.0/oauth2/accessToken`, {
    method: "POST",
    body: JSON.stringify({
      appKey: env("DINGTALK_APP_KEY"),
      appSecret: env("DINGTALK_APP_SECRET")
    })
  });
  openTokenCache = body.accessToken || body.access_token;
  if (!openTokenCache) throw new Error("DingTalk open access token was not returned.");
  return openTokenCache;
}

export async function getLegacyAccessToken() {
  if (legacyTokenCache) return legacyTokenCache;
  requireEnv(["DINGTALK_APP_KEY", "DINGTALK_APP_SECRET"]);
  const url = new URL(`${DINGTALK_OAPI}/gettoken`);
  url.searchParams.set("appkey", env("DINGTALK_APP_KEY"));
  url.searchParams.set("appsecret", env("DINGTALK_APP_SECRET"));
  const body = await fetchJson(url);
  legacyTokenCache = body.access_token || body.accessToken;
  if (!legacyTokenCache) throw new Error("DingTalk legacy access token was not returned.");
  return legacyTokenCache;
}

export async function apiGet(path, searchParams = {}) {
  const token = await getOpenAccessToken();
  const url = new URL(`${DINGTALK_API}${path}`);
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, value);
  }
  return fetchJson(url, {
    headers: {
      "x-acs-dingtalk-access-token": token
    }
  });
}

export async function apiPost(path, payload = {}) {
  const token = await getOpenAccessToken();
  return fetchJson(`${DINGTALK_API}${path}`, {
    method: "POST",
    headers: {
      "x-acs-dingtalk-access-token": token
    },
    body: JSON.stringify(payload)
  });
}

export async function oapiPost(path, payload = {}) {
  const token = await getLegacyAccessToken();
  const url = new URL(`${DINGTALK_OAPI}${path}`);
  url.searchParams.set("access_token", token);
  return fetchJson(url, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
