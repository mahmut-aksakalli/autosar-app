const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { discoverVectorProject } = require("../src/model/vectorProjectService.ts");

test("selects the DPA project closest to the workspace root", async (context) => {
  const workspace = await createWorkspace(context);
  const rootDpa = await workspace.addFile("RootProject.dpa", '<FILE>RootModel.arxml</FILE>');
  const rootModel = await workspace.addFile("RootModel.arxml", "<AUTOSAR />");
  await workspace.addFile("Nested/NestedProject.dpa", '<FILE>NestedModel.arxml</FILE>');
  await workspace.addFile("Nested/NestedModel.arxml", "<AUTOSAR />");

  const project = await discoverVectorProject(workspace.rootPath, workspace.entries);

  assert.equal(project.project.displayName, "RootProject");
  assert.deepEqual(project.project.metadataFiles.map((file) => file.filePath), [rootDpa]);
  assert.deepEqual(project.projectInputFilePaths, [rootModel]);
});

test("selects the alphabetically first DPA at the same hierarchy level", async (context) => {
  const workspace = await createWorkspace(context);
  const alphaDpa = await workspace.addFile("Alpha/AlphaProject.dpa", '<FILE>AlphaModel.arxml</FILE>');
  const alphaModel = await workspace.addFile("Alpha/AlphaModel.arxml", "<AUTOSAR />");
  await workspace.addFile("Beta/BetaProject.dpa", '<FILE>BetaModel.arxml</FILE>');
  await workspace.addFile("Beta/BetaModel.arxml", "<AUTOSAR />");

  const project = await discoverVectorProject(workspace.rootPath, workspace.entries);

  assert.equal(project.project.displayName, "AlphaProject");
  assert.deepEqual(project.project.metadataFiles.map((file) => file.filePath), [alphaDpa]);
  assert.deepEqual(project.projectInputFilePaths, [alphaModel]);
});

test("limits fallback ARXML files to the selected DPA directory", async (context) => {
  const workspace = await createWorkspace(context);
  await workspace.addFile("RootProject.dpa", "<PROJECT />");
  const rootModel = await workspace.addFile("RootModel.arxml", "<AUTOSAR />");
  await workspace.addFile("Nested/NestedProject.dpa", "<PROJECT />");
  await workspace.addFile("Nested/NestedModel.arxml", "<AUTOSAR />");

  const project = await discoverVectorProject(workspace.rootPath, workspace.entries);

  assert.deepEqual(project.projectInputFilePaths, [rootModel]);
});

test("does not merge fallback ARXML files when DPAs share a directory", async (context) => {
  const workspace = await createWorkspace(context);
  await workspace.addFile("Alpha.dpa", "<PROJECT />");
  await workspace.addFile("Beta.dpa", "<PROJECT />");
  await workspace.addFile("Model.arxml", "<AUTOSAR />");

  const project = await discoverVectorProject(workspace.rootPath, workspace.entries);

  assert.equal(project.project.displayName, "Alpha");
  assert.deepEqual(project.projectInputFilePaths, []);
});

test("does not search every ARXML file when a DPA directly references its input", async (context) => {
  const workspace = await createWorkspace(context);
  const selectedDpa = await workspace.addFile("Selected/Project.dpa", '<FILE>Model.arxml</FILE>');
  const selectedModel = await workspace.addFile("Selected/Model.arxml", "<AUTOSAR />");
  await workspace.addFile("Other/OtherModel.arxml", "<AUTOSAR />");
  let fullSearchCount = 0;

  const project = await discoverVectorProject(
    workspace.rootPath,
    workspace.entries.filter((entry) => entry.filePath === selectedDpa),
    async () => {
      fullSearchCount += 1;
      return workspace.entries.filter((entry) => entry.name.endsWith(".arxml"));
    }
  );

  assert.deepEqual(project.projectInputFilePaths, [selectedModel]);
  assert.equal(fullSearchCount, 0);
});

test("scans only a folder named by the selected DPA", async (context) => {
  const workspace = await createWorkspace(context);
  const selectedDpa = await workspace.addFile(
    "Selected/Project.dpa",
    "<PROJECT><ServiceComponents>Components</ServiceComponents></PROJECT>"
  );
  const selectedModel = await workspace.addFile("Selected/Components/Model.arxml", "<AUTOSAR />");
  await workspace.addFile("Other/OtherModel.arxml", "<AUTOSAR />");
  let fullSearchCount = 0;

  const project = await discoverVectorProject(
    workspace.rootPath,
    workspace.entries.filter((entry) => entry.filePath === selectedDpa),
    async () => {
      fullSearchCount += 1;
      return workspace.entries.filter((entry) => entry.name.endsWith(".arxml"));
    }
  );

  assert.deepEqual(project.projectInputFilePaths, [selectedModel]);
  assert.equal(fullSearchCount, 0);
});

test("does not substitute unrelated ARXML files for an unresolved DPA reference", async (context) => {
  const workspace = await createWorkspace(context);
  const selectedDpa = await workspace.addFile("Selected/Project.dpa", '<FILE>Missing.arxml</FILE>');
  await workspace.addFile("Other/Missing.arxml", "<AUTOSAR />");
  let fullSearchCount = 0;

  const project = await discoverVectorProject(
    workspace.rootPath,
    workspace.entries.filter((entry) => entry.filePath === selectedDpa),
    async () => {
      fullSearchCount += 1;
      return workspace.entries.filter((entry) => entry.name.endsWith(".arxml"));
    }
  );

  assert.deepEqual(project.projectInputFilePaths, []);
  assert.equal(fullSearchCount, 0);
});

async function createWorkspace(context) {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "autosar-vector-project-"));
  const entries = [];

  context.after(async () => {
    await fs.rm(rootPath, { recursive: true, force: true });
  });

  return {
    rootPath,
    entries,
    async addFile(relativePath, content) {
      const filePath = path.join(rootPath, relativePath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, "utf8");
      entries.push({
        name: path.basename(filePath),
        relativePath,
        filePath,
        kind: "file",
        openable: true
      });
      return filePath;
    }
  };
}
