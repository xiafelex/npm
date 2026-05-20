import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { loadDotEnv, env } from "./env.mjs";

loadDotEnv();

const dataDir = env("SYNC_OUTPUT_DIR", "data");
const outputDir = env("PDF_OUTPUT_DIR", "docs/wiki-pdf");
const profileDir = env("DINGTALK_BROWSER_PROFILE_DIR", ".auth/dingtalk-browser");
const maxDocs = Number(env("PDF_MAX_DOCS", "10"));
const onlyWorkspace = env("PDF_WORKSPACE_ID", "");
const sectionTreePath = env("PDF_SECTION_TREE_PATH", "");
const pathIncludes = env("PDF_PATH_INCLUDES", "");
const manifestPath = env("PDF_MANIFEST_PATH", join(outputDir, "manifest.json"));
const browserChannel = env("PDF_BROWSER_CHANNEL", "");
const browserExecutablePath = env("PDF_BROWSER_EXECUTABLE_PATH", "");
const loginWaitMs = Number(env("PDF_LOGIN_WAIT_MS", "300000"));
const postLoadWaitMs = Number(env("PDF_POST_LOAD_WAIT_MS", "8000"));
const scrollStepPx = Number(env("PDF_SCROLL_STEP_PX", "1200"));
const scrollPauseMs = Number(env("PDF_SCROLL_PAUSE_MS", "800"));
const exportMode = env("PDF_EXPORT_MODE", "ui");
const exportStatusPollMs = Number(env("PDF_EXPORT_STATUS_POLL_MS", "2000"));
const exportStatusTimeoutMs = Number(env("PDF_EXPORT_STATUS_TIMEOUT_MS", "120000"));
const exportFormat = env("PDF_TARGET_FORMAT", "pdf").toLowerCase();
const debugArtifactsDir = env("PDF_DEBUG_ARTIFACTS_DIR", "tmp-playwright-debug");
const fastToolbarProbeEnabled = env("PDF_FAST_TOOLBAR_PROBE", "1") !== "0";
const fastToolbarProbeAttempts = Number(env("PDF_FAST_TOOLBAR_PROBE_ATTEMPTS", "3"));
const fastToolbarProbePauseMs = Number(env("PDF_FAST_TOOLBAR_PROBE_PAUSE_MS", "700"));
const loadFailureRetryLimit = Number(env("PDF_LOAD_FAILURE_RETRY_LIMIT", "3"));
const continueOnError = env("PDF_CONTINUE_ON_ERROR", "0") === "1";

function safeName(value) {
  return String(value || "untitled")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function outputStem(node, index) {
  const name = safeName(node.name || node.nodeId || `doc-${index + 1}`);
  const nodeId = safeName(node.nodeId || `idx-${index + 1}`);
  return `${name}__${nodeId}`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function loadJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function matchesPathFilters(node, filters) {
  if (!filters.length) return true;
  const haystack = `${node.path || ""}\n${node.name || ""}`.toLowerCase();
  return filters.every((filter) => haystack.includes(filter.toLowerCase()));
}

function isLoginUrl(url) {
  return /login\.dingtalk\.com/i.test(String(url || ""));
}

async function ensureDocumentReady(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  if (!isLoginUrl(page.url())) {
    await page.waitForTimeout(postLoadWaitMs);
    return;
  }

  console.log("DingTalk login required. Complete login/scan in the opened browser window.");
  const startedAt = Date.now();
  while (Date.now() - startedAt < loginWaitMs) {
    await page.waitForTimeout(5000);
    const currentUrl = page.url();
    if (!isLoginUrl(currentUrl)) {
      await page.waitForTimeout(postLoadWaitMs);
      return;
    }
  }

  throw new Error(`Timed out waiting for DingTalk login after ${Math.round(loginWaitMs / 1000)}s.`);
}

async function hydrateLongDocument(page) {
  let previousHeight = -1;
  let stablePasses = 0;

  while (stablePasses < 2) {
    const state = await page.evaluate(({ stepPx }) => {
      const scrollingElement = document.scrollingElement || document.documentElement || document.body;
      const beforeTop = scrollingElement.scrollTop;
      const beforeHeight = scrollingElement.scrollHeight;
      scrollingElement.scrollTo(0, Math.min(beforeTop + stepPx, beforeHeight));
      return {
        top: scrollingElement.scrollTop,
        height: scrollingElement.scrollHeight
      };
    }, { stepPx: scrollStepPx });

    await page.waitForTimeout(scrollPauseMs);

    if (state.height === previousHeight) {
      stablePasses += 1;
    } else {
      stablePasses = 0;
      previousHeight = state.height;
    }

    const nearBottom = await page.evaluate(() => {
      const scrollingElement = document.scrollingElement || document.documentElement || document.body;
      return scrollingElement.scrollTop + window.innerHeight >= scrollingElement.scrollHeight - 8;
    });

    if (nearBottom && stablePasses >= 1) break;
  }

  await page.evaluate(() => {
    const scrollingElement = document.scrollingElement || document.documentElement || document.body;
    scrollingElement.scrollTo(0, 0);
  });
  await page.waitForTimeout(scrollPauseMs);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shortText(value, max = 100) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function getDocFrame(page) {
  return page.frames().find((frame) => String(frame.url() || "").includes("/note/edit"));
}

async function waitForDocFrame(page) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    const frame = getDocFrame(page);
    if (frame) return frame;
    await page.waitForTimeout(1000);
  }
  throw new Error("Timed out waiting for DingTalk document iframe.");
}

async function hasTextTarget(page, frame, text) {
  const frameLocator = frame.locator(`text=${text}`).first();
  if (await frameLocator.count()) return true;
  const pageLocator = page.locator(`text=${text}`).first();
  return await pageLocator.count();
}

async function sampleVisibleTexts(target, limit = 120) {
  return target.evaluate((max) => {
    const values = new Set();
    for (const node of Array.from(document.querySelectorAll("button, [role='button'], [role='menuitem'], [role='dialog'], [role='listitem'], span, div, a"))) {
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 120) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) continue;
      values.add(text);
      if (values.size >= max) break;
    }
    return Array.from(values);
  }, limit).catch(() => []);
}

async function dumpOpenMenuDiagnostics(page, frame, label = "menu-open-failure") {
  mkdirSync(debugArtifactsDir, { recursive: true });
  const safeLabel = safeName(label || "menu-open-failure");
  const screenshotPath = join(debugArtifactsDir, `${safeLabel}.png`);
  const statePath = join(debugArtifactsDir, `${safeLabel}.json`);

  const frames = page.frames().map((item) => ({ url: item.url(), name: item.name() || "" }));
  const pageTexts = await sampleVisibleTexts(page);
  const frameTexts = await sampleVisibleTexts(frame);
  const pageButtons = await page.locator("button, [role='button']").evaluateAll((nodes) => nodes
    .map((node) => {
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      const aria = node.getAttribute("aria-label") || "";
      const title = node.getAttribute("title") || "";
      const cls = node.getAttribute("class") || "";
      const rect = node.getBoundingClientRect();
      return {
        text,
        aria,
        title,
        className: cls,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    })
    .filter((item) => item.width >= 4 && item.height >= 4)
    .slice(0, 200)).catch(() => []);
  const frameButtons = await frame.locator("button, [role='button']").evaluateAll((nodes) => nodes
    .map((node) => {
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      const aria = node.getAttribute("aria-label") || "";
      const title = node.getAttribute("title") || "";
      const cls = node.getAttribute("class") || "";
      const rect = node.getBoundingClientRect();
      return {
        text,
        aria,
        title,
        className: cls,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    })
    .filter((item) => item.width >= 4 && item.height >= 4)
    .slice(0, 200)).catch(() => []);

  await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
  writeJson(statePath, {
    capturedAt: new Date().toISOString(),
    pageUrl: page.url(),
    frameUrl: frame.url(),
    frames,
    pageTexts,
    frameTexts,
    pageButtons,
    frameButtons
  });

  console.error(`Saved menu diagnostics: ${screenshotPath}`);
  console.error(`Saved menu diagnostics: ${statePath}`);
  console.error(`Visible frame texts sample: ${frameTexts.slice(0, 30).join(" | ")}`);
  console.error(
    `Visible frame buttons sample: ${frameButtons.slice(0, 20).map((item) => [item.text, item.aria, item.title, item.className].filter(Boolean).join(" / ")).join(" | ")}`
  );
}

async function clickTextInFrameOrPage(page, frame, text, timeout = 10000) {
  const frameLocator = frame.locator(`text=${text}`).first();
  if (await frameLocator.count()) {
    await frameLocator.click({ force: true, timeout });
    return "frame";
  }

  const pageLocator = page.locator(`text=${text}`).first();
  if (await pageLocator.count()) {
    await pageLocator.click({ force: true, timeout });
    return "page";
  }

  const visibleTexts = await sampleVisibleTexts(page, 80);
  const frameInfo = await frame.evaluate(() => ({ url: location.href })).catch(() => ({ url: frame.url() }));
  const frameTexts = await sampleVisibleTexts(frame, 80);

  throw new Error(
    `Text target not found in frame or page: ${text}\nFrame URL: ${frameInfo.url}\nVisible frame texts sample: ${frameTexts.join(" | ")}\nVisible page texts sample: ${visibleTexts.join(" | ")}`
  );
}

async function revealDocToolbar(page, frame) {
  try {
    await frame.locator("body").click({ position: { x: 240, y: 120 }, timeout: 5000 });
    await page.waitForTimeout(200);
  } catch {
    // continue
  }

  const hoverTargets = [
    { locator: frame.locator("body"), position: { x: 980, y: 20 }, label: "frame body top-right" },
    { locator: frame.locator("body"), position: { x: 860, y: 20 }, label: "frame body upper-mid" },
    { locator: page.locator("iframe[name='wiki-doc-iframe']").first(), position: { x: 980, y: 20 }, label: "iframe element top-right" }
  ];

  for (const target of hoverTargets) {
    try {
      await target.locator.hover({ position: target.position, timeout: 5000 });
      await page.waitForTimeout(300);
    } catch {
      // keep trying
    }
  }
}

async function detectLoadFailure(frame) {
  return frame.evaluate(() => {
    const text = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
    return /加载失败/.test(text) || /立即刷新/.test(text);
  }).catch(() => false);
}

async function tryRecoverLoadFailure(page, frame) {
  const failed = await detectLoadFailure(frame);
  if (!failed) return false;

  const refreshTargets = [
    frame.locator("text=立即刷新").first(),
    page.locator("text=立即刷新").first()
  ];

  for (const target of refreshTargets) {
    try {
      if (await target.count()) {
        await target.click({ force: true, timeout: 5000 });
        await page.waitForTimeout(2500);
        return true;
      }
    } catch {
      // keep trying
    }
  }

  try {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(2500);
    return true;
  } catch {
    return false;
  }
}

async function tryDirectMoreButton(page, frame, label = "direct frame more-button click") {
  const clicked = await frame.evaluate(() => {
    const moreButton = Array.from(document.querySelectorAll("button,[role='button']"))
      .find((node) => {
        if (!node.querySelector("svg._more16")) return false;
        const rect = node.getBoundingClientRect();
        return rect.width >= 18 && rect.height >= 18 && rect.y >= 0 && rect.y <= 80;
      });
    if (!moreButton) return false;
    moreButton.click();
    return true;
  }).catch(() => false);
  if (!clicked) return false;

  await page.waitForTimeout(900);
  if (await hasTextTarget(page, frame, "下载到本地")) {
    console.log(`Opened DingTalk menu via ${label}`);
    return true;
  }
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(250);
  return false;
}

async function fastOpenDownloadMenu(page, frame) {
  if (!fastToolbarProbeEnabled) return false;
  for (let attempt = 0; attempt < fastToolbarProbeAttempts; attempt += 1) {
    await revealDocToolbar(page, frame);
    if (await tryDirectMoreButton(page, frame, `fast direct frame more-button click #${attempt + 1}`)) {
      return true;
    }
    await page.waitForTimeout(fastToolbarProbePauseMs);
  }
  return false;
}

async function waitForDocInteractive(page, frame) {
  const startedAt = Date.now();
  let stablePasses = 0;
  let previousSignature = "";
  let loadFailureRetries = 0;
  while (Date.now() - startedAt < 45000) {
    const state = await frame.evaluate(() => {
      const fullText = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
      const texts = Array.from(new Set(
        Array.from(document.querySelectorAll("button,[role='button'],[role='menuitem'],span,div,a"))
          .map((node) => (node.textContent || "").replace(/\s+/g, " ").trim())
          .filter((text) => text && text.length <= 120)
      ));
      const toolbarButtons = Array.from(document.querySelectorAll("button,[role='button']")).map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          hasMore: !!node.querySelector("svg._more16"),
          y: rect.y,
          width: rect.width,
          height: rect.height
        };
      }).filter((item) => item.width >= 18 && item.height >= 18 && item.y >= 0 && item.y <= 80);
      const bodyLikeTextCount = texts.filter((text) => !["/", "...", "图", "斐"].includes(text)).length;
      return {
        ready: bodyLikeTextCount >= 8 || toolbarButtons.length >= 4,
        bodyLikeTextCount,
        toolbarButtons,
        moreButtons: toolbarButtons.filter((item) => item.hasMore).length,
        loadFailed: /加载失败/.test(fullText) || /立即刷新/.test(fullText)
      };
    }).catch(() => ({ ready: false, bodyLikeTextCount: 0, toolbarButtons: [], moreButtons: 0, loadFailed: false }));

    if (state.loadFailed && loadFailureRetries < loadFailureRetryLimit) {
      loadFailureRetries += 1;
      console.warn(`Detected DingTalk load failure; retrying refresh (${loadFailureRetries}/${loadFailureRetryLimit})...`);
      await tryRecoverLoadFailure(page, frame);
      await page.waitForTimeout(1500);
      continue;
    }

    const signature = JSON.stringify({
      bodyLikeTextCount: state.bodyLikeTextCount,
      toolbarCount: state.toolbarButtons.length,
      moreButtons: state.moreButtons
    });
    if (signature === previousSignature && state.ready) {
      stablePasses += 1;
    } else {
      stablePasses = state.ready ? 1 : 0;
      previousSignature = signature;
    }

    if (state.ready && stablePasses >= 2) {
      await page.waitForTimeout(600);
      return;
    }

    await revealDocToolbar(page, frame);
    await page.waitForTimeout(1500);
  }

  console.warn("Timed out waiting for DingTalk document content to become interactive; proceeding with best effort.");
}

async function openDownloadMenu(page, frame) {
  if (await fastOpenDownloadMenu(page, frame)) return;

  await waitForDocInteractive(page, frame);
  if (await detectLoadFailure(frame)) {
    throw new Error("DingTalk document frame is still in load-failure state after retries.");
  }
  await revealDocToolbar(page, frame);

  if (await tryDirectMoreButton(page, frame)) return;

  const candidateSpecs = [
    { locator: frame.locator("button").filter({ has: frame.locator("svg._more16") }), label: "frame svg._more16 button" },
    { locator: page.locator("button").filter({ has: page.locator("svg._more16") }), label: "page svg._more16 button" },
    { locator: frame.locator("button,[role='button'],div[role='button'],span[role='button']").filter({ hasText: "..." }), label: "frame hasText ..." },
    { locator: page.locator("button,[role='button'],div[role='button'],span[role='button']").filter({ hasText: "..." }), label: "page hasText ..." },
    { locator: frame.locator("[aria-label*='更多'],[title*='更多'],[aria-label*='more'],[title*='more']"), label: "frame label more" },
    { locator: page.locator("[aria-label*='更多'],[title*='更多'],[aria-label*='more'],[title*='more']"), label: "page label more" },
    { locator: frame.locator("[class*='more'],[class*='toolbar'],[class*='action']").locator("button,[role='button']"), label: "frame class more/toolbar/action" },
    { locator: page.locator("[class*='more'],[class*='toolbar'],[class*='action']").locator("button,[role='button']"), label: "page class more/toolbar/action" }
  ];

  const clickCandidateSet = async (locator, label) => {
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const item = locator.nth(index);
      try {
        await item.scrollIntoViewIfNeeded().catch(() => {});
        await item.hover({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(200);
        await item.click({ timeout: 5000, force: true });
        await page.waitForTimeout(900);
        if (await hasTextTarget(page, frame, "下载到本地")) {
          console.log(`Opened DingTalk menu via ${label} #${index + 1}`);
          return true;
        }
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(250);
      } catch {
        if (await hasTextTarget(page, frame, "下载到本地")) {
          console.log(`Opened DingTalk menu via delayed ${label} #${index + 1}`);
          return true;
        }
        try {
          await item.evaluate((node) => node.click());
          await page.waitForTimeout(900);
          if (await hasTextTarget(page, frame, "下载到本地")) {
            console.log(`Opened DingTalk menu via DOM click ${label} #${index + 1}`);
            return true;
          }
          await page.keyboard.press("Escape").catch(() => {});
          await page.waitForTimeout(250);
        } catch {
          // continue probing
        }
      }
    }
    return false;
  };

  for (const spec of candidateSpecs) {
    if (await clickCandidateSet(spec.locator, spec.label)) return;
  }

  const probeTopRight = async (target, scope) => {
    const candidates = await target.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll("button,[role='button'],div[role='button'],span[role='button'],a"));
      const viewportWidth = window.innerWidth;
      return nodes.map((node, index) => {
        const rect = node.getBoundingClientRect();
        return {
          index,
          text: (node.textContent || "").replace(/\s+/g, " ").trim(),
          aria: node.getAttribute("aria-label") || "",
          title: node.getAttribute("title") || "",
          className: node.getAttribute("class") || "",
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          rightGap: viewportWidth - rect.right
        };
      }).filter((item) =>
        item.width >= 18 &&
        item.height >= 18 &&
        item.y >= 0 &&
        item.y <= 180 &&
        item.rightGap >= 0 &&
        item.rightGap <= 320
      ).sort((a, b) => a.rightGap - b.rightGap || a.y - b.y).slice(0, 20);
    }).catch(() => []);

    const locator = target.locator("button,[role='button'],div[role='button'],span[role='button'],a");
    for (const candidate of candidates) {
      const item = locator.nth(candidate.index);
      try {
        await item.scrollIntoViewIfNeeded().catch(() => {});
        await item.hover({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(200);
        await item.click({ timeout: 5000, force: true });
        await page.waitForTimeout(900);
        if (await hasTextTarget(page, frame, "下载到本地")) {
          console.log(
            `Opened DingTalk menu via ${scope} top-right probe: ${shortText(candidate.text) || shortText(candidate.aria) || shortText(candidate.title) || shortText(candidate.className)}`
          );
          return true;
        }
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(250);
      } catch {
        if (await hasTextTarget(page, frame, "下载到本地")) {
          console.log(
            `Opened DingTalk menu via delayed ${scope} top-right probe: ${shortText(candidate.text) || shortText(candidate.aria) || shortText(candidate.title) || shortText(candidate.className)}`
          );
          return true;
        }
        try {
          await item.evaluate((node) => node.click());
          await page.waitForTimeout(900);
          if (await hasTextTarget(page, frame, "下载到本地")) {
            console.log(
              `Opened DingTalk menu via DOM click ${scope} top-right probe: ${shortText(candidate.text) || shortText(candidate.aria) || shortText(candidate.title) || shortText(candidate.className)}`
            );
            return true;
          }
          await page.keyboard.press("Escape").catch(() => {});
          await page.waitForTimeout(250);
        } catch {
          // keep trying
        }
      }
    }
    return false;
  };

  if (await probeTopRight(frame, "frame")) return;
  if (await probeTopRight(page, "page")) return;

  await dumpOpenMenuDiagnostics(page, frame, "open-download-menu-failure");
  throw new Error("Unable to open a DingTalk menu that contains “下载到本地”.");
}

async function exportPdfViaUi(page, outputPath) {
  const frame = await waitForDocFrame(page);

  let createExportJob = null;
  const onResponse = async (response) => {
    if (!response.url().includes("/api/v2/files/createExportJob")) return;
    try {
      createExportJob = JSON.parse(await response.text());
    } catch (error) {
      console.warn("Failed to parse createExportJob response:", error);
    }
  };
  page.on("response", onResponse);

  try {
    await openDownloadMenu(page, frame);
    await clickTextInFrameOrPage(page, frame, "下载到本地");
    await page.waitForTimeout(800);
    await clickTextInFrameOrPage(page, frame, "PDF(.pdf)");
    await page.waitForTimeout(1200);
    const confirmFrame = frame.locator("text=确定").last();
    if (await confirmFrame.count()) {
      await confirmFrame.click({ force: true, timeout: 10000 });
    } else {
      await page.locator("text=确定").last().click({ force: true, timeout: 10000 });
    }

    const startedAt = Date.now();
    while (!createExportJob && Date.now() - startedAt < 20000) {
      await sleep(500);
    }
    if (!createExportJob?.data?.jobId || !createExportJob?.data?.url) {
      throw new Error("DingTalk did not return createExportJob metadata for PDF export.");
    }

    const { jobId, url } = createExportJob.data;
    while (Date.now() - startedAt < exportStatusTimeoutMs) {
      const result = await page.evaluate(async (currentJobId) => {
        const response = await fetch(`/api/v2/files/queryExportStatus?jobId=${currentJobId}`, {
          credentials: "include"
        });
        return response.json();
      }, jobId);
      if (result?.data?.done) break;
      await sleep(exportStatusPollMs);
    }

    const pdfResponse = await fetch(url);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to download exported PDF: ${pdfResponse.status} ${pdfResponse.statusText}`);
    }
    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
    writeFileSync(outputPath, pdfBuffer);
    return {
      exportMethod: "dingtalk-ui",
      exportJobId: jobId,
      exportUrl: url
    };
  } finally {
    page.off("response", onResponse);
  }
}

async function exportMarkdownViaUi(page, outputPath) {
  const frame = await waitForDocFrame(page);
  await openDownloadMenu(page, frame);
  await clickTextInFrameOrPage(page, frame, "下载到本地");
  await page.waitForTimeout(800);

  const downloadPromise = page.waitForEvent("download", { timeout: exportStatusTimeoutMs });
  await clickTextInFrameOrPage(page, frame, "Markdown(.md)");
  const download = await downloadPromise;
  await download.saveAs(outputPath);

  return {
    exportMethod: "dingtalk-ui",
    exportDownloadName: download.suggestedFilename()
  };
}

function collectAlidocs() {
  const filters = normalizeList(pathIncludes);
  if (sectionTreePath) {
    if (!existsSync(sectionTreePath)) {
      throw new Error(`Section tree not found: ${sectionTreePath}`);
    }
    return readJson(sectionTreePath)
      .filter((node) => node.type === "FILE" && node.category === "ALIDOC" && node.url)
      .filter((node) => !onlyWorkspace || node.workspaceId === onlyWorkspace)
      .filter((node) => matchesPathFilters(node, filters));
  }

  const wikiRoot = join(dataDir, "wiki");
  if (!existsSync(wikiRoot)) {
    throw new Error(`Wiki data not found: ${wikiRoot}. Run npm run sync:wiki first.`);
  }

  const docs = [];
  for (const workspaceName of readDirNames(wikiRoot)) {
    const treePath = join(wikiRoot, workspaceName, "tree.json");
    if (!existsSync(treePath)) continue;
    for (const node of readJson(treePath)) {
      if (onlyWorkspace && node.workspaceId !== onlyWorkspace) continue;
      if (node.type === "FILE" && node.category === "ALIDOC" && node.url && matchesPathFilters(node, filters)) {
        docs.push(node);
      }
    }
  }
  return docs;
}

function readDirNames(path) {
  return existsSync(path)
    ? readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
    : [];
}

async function main() {
  const docs = collectAlidocs().slice(0, maxDocs);
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(profileDir, { recursive: true });
  mkdirSync(dirname(manifestPath), { recursive: true });
  const previousManifest = loadJson(manifestPath, { docs: [] });

  const launchOptions = {
    headless: false,
    viewport: { width: 1440, height: 1200 }
  };
  if (browserChannel) launchOptions.channel = browserChannel;
  if (browserExecutablePath) launchOptions.executablePath = browserExecutablePath;

  const context = await chromium.launchPersistentContext(profileDir, launchOptions);
  const page = await context.newPage();
  const manifest = {
    generatedAt: new Date().toISOString(),
    source: sectionTreePath ? "section-tree" : "workspace-tree",
    sectionTreePath: sectionTreePath || null,
    outputDir,
    exportMode,
    exportFormat,
    browserChannel: browserChannel || null,
    browserExecutablePath: browserExecutablePath || null,
    docs: Array.isArray(previousManifest.docs) ? [...previousManifest.docs] : []
  };
  const manifestByNodeId = new Map(
    manifest.docs
      .filter((item) => item?.nodeId)
      .map((item) => [item.nodeId, item])
  );

  console.log(`Exporting ${docs.length} DingTalk doc(s) to ${outputDir}`);
  console.log("If DingTalk asks you to login, finish login in the opened browser window once.");
  let successCount = 0;
  let failureCount = 0;
  const overallTotal = Number(process.env.PDF_OVERALL_TOTAL || "0");
  const overallDoneBefore = Number(process.env.PDF_OVERALL_DONE_BEFORE || "0");

  for (const [index, node] of docs.entries()) {
    const url = node.url;
    const name = outputStem(node, index);
    const outputPath = join(outputDir, `${name}.${exportFormat === "md" ? "md" : "pdf"}`);
    const overallLabel =
      overallTotal > 0 ? ` | overall~${Math.min(overallDoneBefore + index + 1, overallTotal)}/${overallTotal}` : "";
    console.log(`[${index + 1}/${docs.length}${overallLabel}] ${node.name}`);
    try {
      await ensureDocumentReady(page, url);
      let exportMeta;
      if (exportFormat === "md") {
        exportMeta = await exportMarkdownViaUi(page, outputPath);
      } else if (exportMode === "print") {
        await hydrateLongDocument(page);
        await page.pdf({
          path: outputPath,
          format: "A4",
          printBackground: true,
          margin: { top: "12mm", right: "10mm", bottom: "12mm", left: "10mm" }
        });
        exportMeta = { exportMethod: "playwright-print" };
      } else {
        exportMeta = await exportPdfViaUi(page, outputPath);
      }
      const manifestEntry = {
        index: index + 1,
        name: node.name || node.nodeId,
        nodeId: node.nodeId || null,
        workspaceId: node.workspaceId || null,
        sourceCreateTime: node.createTime || null,
        sourceModifiedTime: node.modifiedTime || null,
        sourceCategory: node.category || null,
        sourceExtension: node.extension || null,
        path: node.path || null,
        url,
        exportedAt: new Date().toISOString(),
        outputPath,
        status: "success",
        ...exportMeta
      };
      if (manifestEntry.nodeId) {
        manifestByNodeId.set(manifestEntry.nodeId, manifestEntry);
      } else {
        manifest.docs.push(manifestEntry);
      }
      successCount += 1;
    } catch (error) {
      const manifestEntry = {
        index: index + 1,
        name: node.name || node.nodeId,
        nodeId: node.nodeId || null,
        workspaceId: node.workspaceId || null,
        sourceCreateTime: node.createTime || null,
        sourceModifiedTime: node.modifiedTime || null,
        sourceCategory: node.category || null,
        sourceExtension: node.extension || null,
        path: node.path || null,
        url,
        exportedAt: new Date().toISOString(),
        outputPath,
        status: "failed",
        error: error?.message || String(error)
      };
      console.error(error);
      if (manifestEntry.nodeId) {
        manifestByNodeId.set(manifestEntry.nodeId, manifestEntry);
      } else {
        manifest.docs.push(manifestEntry);
      }
      failureCount += 1;
      if (!continueOnError) {
        throw error;
      }
      console.warn(`Continuing after export failure for ${node.name || node.nodeId}`);
    }
  }

  await context.close();
  manifest.docs = [
    ...manifest.docs.filter((item) => !item?.nodeId),
    ...[...manifestByNodeId.values()].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans-CN"))
  ];
  manifest.generatedAt = new Date().toISOString();
  writeJson(manifestPath, manifest);
  console.log(`Manifest written to ${manifestPath}`);
  console.log(`Export summary: success=${successCount}, failed=${failureCount}, total=${docs.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
