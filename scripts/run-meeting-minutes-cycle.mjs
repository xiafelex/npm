import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { loadDotEnv } from "./env.mjs";
import {
  meetingBatchPath,
  meetingRunLogPath,
  meetingRunStatePath
} from "./meeting-minutes-paths.mjs";

loadDotEnv();

const loopEnabled = process.env.MEETING_LOOP === "1";
const maxCycles = Number(process.env.MEETING_LOOP_MAX_CYCLES || "1");
const syncVault = process.env.MEETING_LOOP_SYNC_VAULT === "1";

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

function run(command) {
  execFileSync("npm", ["run", command], {
    stdio: "inherit",
    env: process.env
  });
}

function appendLog(entry) {
  appendFileSync(meetingRunLogPath, `${JSON.stringify(entry)}\n`);
}

function main() {
  let cycle = 0;
  let lastSummary = null;
  while (cycle < maxCycles) {
    cycle += 1;
    const startedAt = new Date().toISOString();
    run("batch:meeting-minutes");
    const batch = readJson(meetingBatchPath, []);
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

    run("sync:meeting-minutes:md");
    if (syncVault) {
      run("sync:meeting-minutes:vault");
    }
    run("status:meeting-minutes");

    lastSummary = {
      cycle,
      startedAt,
      finishedAt: new Date().toISOString(),
      batchSize: batch.length,
      status: "completed_batch"
    };
    appendLog(lastSummary);

    if (!loopEnabled) break;
  }

  const state = {
    lastRunAt: new Date().toISOString(),
    lastRunSummary: lastSummary,
    loopEnabled,
    maxCycles,
    syncVault
  };
  writeJson(meetingRunStatePath, state);
}

main();
