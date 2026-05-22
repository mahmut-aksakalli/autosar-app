import { BrowserWindow, dialog, ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import type { SwcGraphQuery } from "../src/shared/contracts.js";
import { WorkspaceService } from "./services/workspaceService.js";
import { ArxmlDocumentService } from "./services/arxmlDocumentService.js";
import { GraphService } from "./services/graphService.js";
import { AppStateService } from "./services/appStateService.js";

const workspaceService = new WorkspaceService();
const documentService = new ArxmlDocumentService(workspaceService);
const graphService = new GraphService(workspaceService);
const appStateService = new AppStateService();

export function registerIpcHandlers() {
  workspaceService.onUpdated((workspace) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send("workspace:updated", workspace);
    }
  });

  ipcMain.handle("workspace:open", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"]
    });

    const selectedPath = result.filePaths[0];
    if (result.canceled || !selectedPath) {
      return null;
    }

    const workspaceResult = await workspaceService.openWorkspace(selectedPath);
    await appStateService.setLastWorkspacePath(selectedPath);
    return workspaceResult;
  });

  ipcMain.handle("workspace:openPath", async (_event, rootPath: string) => {
    if (!rootPath) {
      return null;
    }

    const workspaceResult = await workspaceService.openWorkspace(rootPath);
    await appStateService.setLastWorkspacePath(rootPath);
    return workspaceResult;
  });

  ipcMain.handle("workspace:openFile", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "AUTOSAR XML", extensions: ["arxml"] }]
    });

    const selectedPath = result.filePaths[0];
    if (result.canceled || !selectedPath) {
      return null;
    }

    const activeWorkspace = workspaceService.getSnapshot();
    if (activeWorkspace) {
      const document = await documentService.openDocument(selectedPath);
      return {
        workspace: workspaceService.getSnapshot() ?? activeWorkspace,
        document
      };
    }

    const workspaceResult = await workspaceService.openFile(selectedPath);
    return {
      workspace: workspaceResult.workspace,
      document: workspaceResult.firstFile ?? (await documentService.openDocument(selectedPath))
    };
  });

  ipcMain.handle("workspace:openFilePath", async (_event, filePath: string) => {
    if (!filePath) {
      return null;
    }

    const activeWorkspace = workspaceService.getSnapshot();
    if (activeWorkspace) {
      const document = await documentService.openDocument(filePath);
      return {
        workspace: workspaceService.getSnapshot() ?? activeWorkspace,
        document
      };
    }

    const workspaceResult = await workspaceService.openFile(filePath);
    return {
      workspace: workspaceResult.workspace,
      document: workspaceResult.firstFile ?? (await documentService.openDocument(filePath))
    };
  });

  ipcMain.handle("workspace:state", async () => workspaceService.getSnapshot());
  ipcMain.handle("document:open", async (_event, filePath: string) =>
    documentService.openDocument(filePath)
  );
  ipcMain.handle(
    "document:preview",
    async (_event, payload: { filePath: string; content: string }) =>
      documentService.previewDocument(payload.filePath, payload.content)
  );
  ipcMain.handle(
    "document:save",
    async (_event, payload: { filePath: string; content: string }) =>
      documentService.saveDocument(payload.filePath, payload.content)
  );
  ipcMain.handle("document:close", async (_event, filePath: string) =>
    documentService.closeDocument(filePath)
  );
  ipcMain.handle(
    "document:validate",
    async (_event, payload: { filePath: string; content: string }) =>
      documentService.validateDocument(payload.filePath, payload.content)
  );
  ipcMain.handle("graph:build", async (_event, query: SwcGraphQuery) =>
    graphService.buildGraph(query)
  );
  ipcMain.handle(
    "search:files",
    async (
      _event,
      payload: {
        query: string;
        openDocuments: Array<{ filePath: string; relativePath: string; content: string }>;
      }
    ) => searchFiles(payload.query, payload.openDocuments)
  );
}

export async function restorePersistedWorkspace() {
  const lastWorkspacePath = await appStateService.getLastWorkspacePath();
  if (!lastWorkspacePath) {
    return;
  }

  try {
    await workspaceService.openWorkspace(lastWorkspacePath);
  } catch {
    return;
  }
}

async function searchFiles(
  query: string,
  openDocuments: Array<{ filePath: string; relativePath: string; content: string }>
) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const overrides = new Map(
    openDocuments.map((document) => [
      document.filePath,
      {
        relativePath: document.relativePath,
        content: document.content
      }
    ])
  );

  const candidates = new Map<string, { relativePath: string; content?: string }>();

  for (const entry of workspaceService.getSearchableWorkspaceFiles()) {
    candidates.set(entry.filePath, {
      relativePath: entry.relativePath
    });
  }

  for (const document of openDocuments) {
    candidates.set(document.filePath, {
      relativePath: document.relativePath,
      content: document.content
    });
  }

  const results: Array<{
    filePath: string;
    relativePath: string;
    matches: Array<{
      lineNumber: number;
      lineText: string;
      matchStart: number;
      matchLength: number;
    }>;
  }> = [];

  for (const [filePath, candidate] of candidates) {
    const override = overrides.get(filePath);
    const content =
      override?.content ??
      candidate.content ??
      (await fs.readFile(filePath, "utf8").catch(() => undefined));

    if (!content) {
      continue;
    }

    const matches = collectSearchMatches(content, normalizedQuery);
    if (matches.length === 0) {
      continue;
    }

    results.push({
      filePath,
      relativePath: override?.relativePath ?? candidate.relativePath ?? path.basename(filePath),
      matches
    });
  }

  return results.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function collectSearchMatches(content: string, normalizedQuery: string) {
  const lines = content.split(/\r?\n/);
  const matches: Array<{
    lineNumber: number;
    lineText: string;
    matchStart: number;
    matchLength: number;
  }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const lineText = lines[index] ?? "";
    const normalizedLine = lineText.toLowerCase();
    let searchFrom = 0;

    while (searchFrom <= normalizedLine.length) {
      const matchStart = normalizedLine.indexOf(normalizedQuery, searchFrom);
      if (matchStart === -1) {
        break;
      }

      matches.push({
        lineNumber: index + 1,
        lineText,
        matchStart,
        matchLength: normalizedQuery.length
      });

      if (matches.length >= 10) {
        return matches;
      }

      searchFrom = matchStart + normalizedQuery.length;
    }
  }

  return matches;
}
