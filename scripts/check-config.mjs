import { loadDotEnv, env, csv } from "./env.mjs";

loadDotEnv();

const required = ["DINGTALK_APP_KEY", "DINGTALK_APP_SECRET"];
const missing = required.filter((name) => !env(name));

if (missing.length) {
  console.error(`Missing required variables: ${missing.join(", ")}`);
  console.error("Copy .env.example to .env and fill DingTalk app credentials.");
  process.exit(1);
}

console.log("DingTalk credentials: configured");
console.log(`Operator userId: ${env("DINGTALK_OPERATOR_ID") || "(not set)"}`);
console.log(`Wiki workspaces: ${csv("DINGTALK_WIKI_WORKSPACE_IDS").length || "auto/list"}`);
console.log(`Report users: ${csv("DINGTALK_REPORT_USER_IDS").length || "(not set)"}`);
console.log(`Report templates: ${csv("DINGTALK_REPORT_TEMPLATE_NAMES").length || "all accessible"}`);
console.log(`Report sync window: ${env("SYNC_LOG_DAYS", "14")} days`);
