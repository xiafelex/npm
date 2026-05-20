import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadDotEnv, env, requireEnv } from "./env.mjs";

loadDotEnv();
requireEnv(["DINGTALK_APP_KEY", "DINGTALK_APP_SECRET"]);

const authCode = env("DINGTALK_AUTH_CODE");
const refreshToken = env("DINGTALK_USER_REFRESH_TOKEN");

if (!authCode && !refreshToken) {
  console.error("Set DINGTALK_AUTH_CODE for first exchange, or DINGTALK_USER_REFRESH_TOKEN to refresh.");
  process.exit(1);
}

const payload = {
  clientId: env("DINGTALK_APP_KEY"),
  clientSecret: env("DINGTALK_APP_SECRET"),
  code: authCode || undefined,
  refreshToken: refreshToken || undefined,
  grantType: authCode ? "authorization_code" : "refresh_token"
};

const response = await fetch("https://api.dingtalk.com/v1.0/oauth2/userAccessToken", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload)
});

const body = await response.json();
if (!response.ok || body.code || body.errcode) {
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

mkdirSync(".auth", { recursive: true });
const outputPath = join(".auth", "dingtalk-user-token.json");
writeFileSync(outputPath, `${JSON.stringify({
  ...body,
  savedAt: new Date().toISOString()
}, null, 2)}\n`);

console.log(`User token saved to ${outputPath}`);
console.log(`expires in: ${body.expireIn ?? body.expiresIn ?? "unknown"} seconds`);
console.log(`corpId: ${body.corpId || "(not returned)"}`);
