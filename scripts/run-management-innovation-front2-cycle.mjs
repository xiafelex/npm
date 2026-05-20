import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const batchPath = process.env.MI_LOOP_BATCH_PATH || "data/wiki-sections/管理创新-前两层/TOP20_READY.json";
const runLogPath = process.env.MI_LOOP_RUN_LOG_PATH || "data/wiki-sections/管理创新-前两层/round-run-log.jsonl";
const runStatePath = process.env.MI_LOOP_RUN_STATE_PATH || "data/wiki-sections/管理创新-前两层/round-run-state.json";
const loopEnabled = process.env.MI_LOOP === "1";
const maxCycles = Number(process.env.MI_LOOP_MAX_CYCLES || "1");
const syncVault = process.env.MI_LOOP_SYNC_VAULT !== "0";
const autoCommit = process.env.MI_VAULT_GIT_COMMIT || "1";
const autoPush = process.env.MI_VAULT_GIT_PUSH || "1";
const analyzeCommand = process.env.MI_LOOP_ANALYZE_COMMAND || "analyze:management-innovation:front2";
const reportCommand = process.env.MI_LOOP_REPORT_COMMAND || "report:management-innovation:front2";
const batchCommand = process.env.MI_LOOP_BATCH_COMMAND || "batch:management-innovation:top20";
const syncMdCommand = process.env.MI_LOOP_SYNC_MD_COMMAND || "sync:management-innovation:top20:md";
const vaultCommand = process.env.MI_LOOP_VAULT_COMMAND || "sync:management-innovation:front2:vault";

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function run(command, extraEnv = {}) {
  execFileSync("npm", ["run", command], {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv }
  });
}

function appendLog(entry) {
  appendFileSync(runLogPath, `${JSON.stringify(entry)}\n`);
}

function main() {
  let cycle = 0;
  let lastSummary = null;
  while (cycle < maxCycles) {
    cycle += 1;
    const startedAt = new Date().toISOString();
    run(analyzeCommand);
    run(reportCommand);
    run(batchCommand);
    const batch = readJson(batchPath, []);
    if (!batch.length) {
      lastSummary = {
        cycle,
        startedAt,
        finishedAt: new Date().toISOString(),
        batchSize: 0,
        status: "completed_no_pending_docs"
      };
      appendLog(lastSummary);
      break;
    }

    run(syncMdCommand);
    run(analyzeCommand);
    run(reportCommand);

    let vaultStatus = "skipped";
    let vaultError = null;
    if (syncVault) {
      try {
        run(vaultCommand, {
          MI_VAULT_GIT_COMMIT: autoCommit,
          MI_VAULT_GIT_PUSH: autoPush
        });
        vaultStatus = "completed";
      } catch (error) {
        vaultStatus = "failed_but_continued";
        vaultError = error?.message || String(error);
        console.warn("Management innovation vault sync failed; continuing to next batch.");
      }
    }

    lastSummary = {
      cycle,
      startedAt,
      finishedAt: new Date().toISOString(),
      batchSize: batch.length,
      status: "completed_batch",
      vaultStatus,
      vaultError
    };
    appendLog(lastSummary);

    if (!loopEnabled) break;
  }

  writeJson(runStatePath, {
    lastRunAt: new Date().toISOString(),
    lastRunSummary: lastSummary,
    loopEnabled,
    maxCycles,
    syncVault,
    autoCommit,
    autoPush
  });
}

main();
