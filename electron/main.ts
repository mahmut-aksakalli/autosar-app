import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerIpcHandlers, restorePersistedWorkspace } from "./mainIpc.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const smokeMode = process.env.CODEX_SMOKE === "1";
const smokeReportFile = process.env.CODEX_SMOKE_REPORT_FILE;
let emittedSmokeReport = false;

type SmokeError = {
  source: string;
  message: string;
};

type SmokeReport = {
  didFinishLoad: boolean;
  checks: string[];
  errors: SmokeError[];
};

function createSmokeReport(): SmokeReport {
  return {
    didFinishLoad: false,
    checks: [],
    errors: []
  };
}

function addSmokeError(report: SmokeReport, source: string, message: string) {
  report.errors.push({ source, message });
}

function emitSmokeReport(report: SmokeReport) {
  if (emittedSmokeReport) {
    return;
  }

  emittedSmokeReport = true;
  const serialized = JSON.stringify(report);

  if (smokeReportFile) {
    fs.writeFileSync(smokeReportFile, serialized, "utf8");
  }

  process.stdout.write(`__CODEX_SMOKE_REPORT__${serialized}\n`);
}

async function finalizeSmoke(mainWindow: BrowserWindow, report: SmokeReport) {
  try {
    const result = (await mainWindow.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const startedAt = Date.now();
        const maxWaitMs = 4000;

        const collect = () => {
          const hasRootShell = Boolean(document.querySelector(".app-shell"));
          const hasAppTitle =
            document.title.includes("AUTOSAR App") ||
            document.body.innerText.includes("AUTOSAR App");

          if (hasRootShell || Date.now() - startedAt >= maxWaitMs) {
            resolve({ hasRootShell, hasAppTitle });
            return;
          }

          window.setTimeout(collect, 100);
        };

        collect();
      })
    `)) as {
      hasRootShell: boolean;
      hasAppTitle: boolean;
    };

    report.checks.push(result.hasRootShell ? "app-shell-found" : "app-shell-missing");
    report.checks.push(result.hasAppTitle ? "title-found" : "title-missing");

    if (!result.hasRootShell) {
      addSmokeError(report, "renderer", "App shell did not render.");
    }

    if (!result.hasAppTitle) {
      addSmokeError(report, "renderer", "Expected AUTOSAR app title text was not found.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addSmokeError(report, "renderer", `Smoke check JavaScript failed: ${message}`);
  }

  emitSmokeReport(report);
  app.exit(report.errors.length === 0 ? 0 : 1);
}

if (smokeMode) {
  const earlySmokeReport = createSmokeReport();

  process.on("uncaughtException", (error) => {
    addSmokeError(earlySmokeReport, "main", `Uncaught exception: ${error.message}`);
    emitSmokeReport(earlySmokeReport);
    app.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    addSmokeError(earlySmokeReport, "main", `Unhandled rejection: ${String(reason)}`);
    emitSmokeReport(earlySmokeReport);
    app.exit(1);
  });
}

function createWindow() {
  const rendererUrl = process.env.VITE_DEV_SERVER_URL;
  const preloadPath = rendererUrl
    ? path.resolve(process.cwd(), "electron", "preload.cjs")
    : path.join(__dirname, "preload.cjs");
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1200,
    minHeight: 800,
    backgroundColor: "#0f141e",
    show: !smokeMode,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const smokeReport = createSmokeReport();
  createApplicationMenu(mainWindow);

  let smokeCompleted = false;

  if (smokeMode) {
    const finishOnce = () => {
      if (smokeCompleted) {
        return;
      }
      smokeCompleted = true;
      void finalizeSmoke(mainWindow, smokeReport);
    };

    const timeoutMs = Number(process.env.CODEX_SMOKE_TIMEOUT_MS ?? 15000);
    const timeoutHandle = setTimeout(() => {
      addSmokeError(smokeReport, "main", `Smoke test timed out after ${timeoutMs}ms.`);
      finishOnce();
    }, timeoutMs);

    mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      if (level >= 2) {
        addSmokeError(smokeReport, "console", `${sourceId}:${line} ${message}`);
      }
    });

    mainWindow.webContents.on("did-finish-load", () => {
      smokeReport.didFinishLoad = true;
      smokeReport.checks.push("did-finish-load");
      setTimeout(() => {
        clearTimeout(timeoutHandle);
        finishOnce();
      }, 500);
    });

    mainWindow.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (isMainFrame) {
          addSmokeError(
            smokeReport,
            "load",
            `Failed to load ${validatedURL} (${errorCode}): ${errorDescription}`
          );
        }
      }
    );

    mainWindow.webContents.on("render-process-gone", (_event, details) => {
      addSmokeError(smokeReport, "renderer", `Render process exited: ${details.reason}`);
    });

    mainWindow.on("unresponsive", () => {
      addSmokeError(smokeReport, "window", "Browser window became unresponsive.");
    });
  }

  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(path.resolve(__dirname, "..", "..", "dist", "index.html"));
  }
}

function createApplicationMenu(mainWindow: BrowserWindow) {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [{ role: "quit" }]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [
        {
          label: "Toggle Bottom Panel",
          accelerator: "Ctrl+Shift+D",
          click: () => {
            mainWindow.webContents.send("view:toggleBottomPanel");
          }
        },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "close" }]
    },
    {
      label: "Help",
      submenu: [{ role: "about" }]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  await restorePersistedWorkspace();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
