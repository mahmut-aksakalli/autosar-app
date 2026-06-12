import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { discoverVectorProject } from "../electron/services/vectorProjectService.js";
import { WorkspaceService } from "../electron/services/workspaceService.js";
import type { ExplorerEntry, WorkspaceSnapshot } from "../src/shared/contracts.js";

const engineArxml = `<?xml version="1.0" encoding="utf-8"?>
<AUTOSAR>
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>VectorPkg</SHORT-NAME>
      <ELEMENTS>
        <APPLICATION-SW-COMPONENT-TYPE>
          <SHORT-NAME>EngineControl</SHORT-NAME>
        </APPLICATION-SW-COMPONENT-TYPE>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

const ignoredArxml = `<?xml version="1.0" encoding="utf-8"?>
<AUTOSAR>
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>IgnoredPkg</SHORT-NAME>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

test("discoverVectorProject recognizes DaVinci metadata and resolves referenced ARXML inputs", async () => {
  const rootPath = await createVectorFixture();
  const dcfPath = path.join(rootPath, "Project.dcf");
  const modelPath = path.join(rootPath, "Config", "Engine.arxml");
  const entries: ExplorerEntry[] = [
    folderEntry(rootPath, "Config"),
    fileEntry(rootPath, dcfPath, false),
    fileEntry(rootPath, modelPath, true),
    fileEntry(rootPath, path.join(rootPath, "Config", "Ignored.arxml"), true)
  ];

  const discovery = await discoverVectorProject(rootPath, entries);

  assert.equal(discovery?.project.kind, "vector-davinci");
  assert.equal(discovery?.project.metadataFiles[0]?.kind, "dcf");
  assert.deepEqual(
    discovery?.project.inputFiles.map((input) => input.relativePath),
    [path.join("Config", "Engine.arxml")]
  );
});

test("WorkspaceService indexes Vector DaVinci project ARXMLs in the background", async () => {
  const rootPath = await createVectorFixture();
  const service = new WorkspaceService();
  try {
    const initialResult = await service.openWorkspace(rootPath);

    assert.equal(initialResult.workspace.workspaceKind, "vector-davinci");
    assert.equal(initialResult.workspace.files.length, 0);
    assert.equal(initialResult.workspace.project?.indexingStatus, "loading");

    const indexedSnapshot = await waitForWorkspaceUpdate(
      service,
      (snapshot) => snapshot.files.some((file) => file.shortName === "VectorPkg")
    );

    assert.equal(indexedSnapshot.project?.metadataFiles[0]?.kind, "dcf");
    assert.equal(indexedSnapshot.project?.indexingStatus, "complete");
    assert.deepEqual(indexedSnapshot.files.map((file) => file.relativePath), [path.join("Config", "Engine.arxml")]);
    assert.equal(indexedSnapshot.entities.some((entity) => entity.shortName === "EngineControl"), true);
    assert.equal(indexedSnapshot.files[0]?.validation.scope, "workspace");
  } finally {
    await service.dispose();
  }
});

test("WorkspaceService keeps plain folders lazy and parses opened ARXMLs as single-file context", async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "autosar-plain-"));
  const filePath = path.join(rootPath, "Standalone.arxml");
  await fs.writeFile(filePath, engineArxml, "utf8");

  const service = new WorkspaceService();
  try {
    const initialResult = await service.openWorkspace(rootPath);
    assert.equal(initialResult.workspace.workspaceKind, "folder");
    assert.equal(initialResult.workspace.files.length, 0);
    assert.equal(initialResult.workspace.project?.indexingStatus, "idle");

    const document = await service.getDocument(filePath);
    service.updateDocument(document);
    const snapshot = service.getSnapshot();

    assert.equal(snapshot?.files.length, 1);
    assert.equal(snapshot?.files[0]?.validation.scope, "single-file");
  } finally {
    await service.dispose();
  }
});

async function createVectorFixture() {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "autosar-vector-"));
  const configPath = path.join(rootPath, "Config");
  await fs.mkdir(configPath, { recursive: true });
  await fs.writeFile(path.join(rootPath, "Project.dcf"), '<Project><File path="Config/Engine.arxml" /></Project>', "utf8");
  await fs.writeFile(path.join(configPath, "Engine.arxml"), engineArxml, "utf8");
  await fs.writeFile(path.join(configPath, "Ignored.arxml"), ignoredArxml, "utf8");
  return rootPath;
}

function folderEntry(rootPath: string, relativePath: string): ExplorerEntry {
  return {
    name: path.basename(relativePath),
    relativePath,
    filePath: path.join(rootPath, relativePath),
    kind: "folder",
    openable: false
  };
}

function fileEntry(rootPath: string, filePath: string, openable: boolean): ExplorerEntry {
  return {
    name: path.basename(filePath),
    relativePath: path.relative(rootPath, filePath),
    filePath,
    kind: "file",
    openable
  };
}

function waitForWorkspaceUpdate(
  service: WorkspaceService,
  predicate: (snapshot: WorkspaceSnapshot) => boolean
) {
  return new Promise<WorkspaceSnapshot>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for workspace update.")), 5000);
    const currentSnapshot = service.getSnapshot();
    if (currentSnapshot && predicate(currentSnapshot)) {
      clearTimeout(timeout);
      resolve(currentSnapshot);
      return;
    }

    service.onUpdated((snapshot) => {
      if (!predicate(snapshot)) {
        return;
      }
      clearTimeout(timeout);
      resolve(snapshot);
    });
  });
}
