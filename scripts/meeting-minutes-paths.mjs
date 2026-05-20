import { dirname, join } from "node:path";

export const meetingSectionSlug = "中心办公-会议培训-公司职能部门月度汇报";
export const meetingTreePath = `data/wiki-sections/${meetingSectionSlug}/tree.json`;
export const meetingRegistryJsonPath = `data/wiki-sections/${meetingSectionSlug}/sync-registry.json`;
export const meetingRegistryMdPath = `data/wiki-sections/${meetingSectionSlug}/SYNC_REGISTRY.md`;
export const meetingApiDocsDir = `docs/wiki/${meetingSectionSlug}`;
export const meetingUiDocsDir = `docs/wiki-md/${meetingSectionSlug}`;
export const meetingUiManifestPath = join(meetingUiDocsDir, "manifest.json");
export const meetingBatchPath = "data/section-workplans/monthly-meeting-minutes.batch.next5.json";
export const meetingBatchSummaryPath = "data/section-workplans/monthly-meeting-minutes.summary.md";
export const meetingRunLogPath = "data/section-workplans/monthly-meeting-minutes.run-log.jsonl";
export const meetingRunStatePath = "data/section-workplans/monthly-meeting-minutes.run-state.json";

export const defaultVaultRoot = "/Users/felex/Documents/Codex/ai-memory-vault-local";
export const vaultImportRoot = join(
  defaultVaultRoot,
  "memory",
  "imports",
  "dingtalk",
  "tech_center",
  "monthly_meeting_minutes"
);
export const vaultRawMdDir = join(vaultImportRoot, "raw-md");
export const vaultCatalogDir = join(vaultImportRoot, "catalog");
export const vaultNotesDir = join(vaultImportRoot, "notes");
export const vaultSyncStatePath = join(vaultCatalogDir, "vault-sync-status.json");
export const vaultManifestCopyPath = join(vaultCatalogDir, "manifest.json");
export const vaultRegistryCopyPath = join(vaultCatalogDir, "sync-registry.json");
export const vaultRegistryMdCopyPath = join(vaultCatalogDir, "SYNC_REGISTRY.md");
export const vaultBatchSummaryCopyPath = join(vaultCatalogDir, "monthly-meeting-minutes.summary.md");

export function parentDir(path) {
  return dirname(path);
}
