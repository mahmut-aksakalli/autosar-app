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

test("follows a selected DPA into its DCF and indexes both sets of ARXML inputs", async (context) => {
  const workspace = await createWorkspace(context);
  const dpaPath = await workspace.addFile(
    "Project.dpa",
    "<ProjectAssistant><DVWorkspace>Config/Developer/Project.dcf</DVWorkspace><FILE>RootModel.arxml</FILE></ProjectAssistant>"
  );
  const dcfPath = await workspace.addFile(
    "Config/Developer/Project.dcf",
    "<DCF><FILEREF><ARXML>../../RootModel.arxml</ARXML></FILEREF><FILEREF><ARXML>ExtraModel.arxml</ARXML></FILEREF></DCF>"
  );
  const rootModel = await workspace.addFile("RootModel.arxml", "<AUTOSAR />");
  const extraModel = await workspace.addFile("Config/Developer/ExtraModel.arxml", "<AUTOSAR />");
  await workspace.addFile("Other/Nested/Unrelated.dcf", "<DCF><ARXML>Unrelated.arxml</ARXML></DCF>");
  await workspace.addFile("Other/Nested/Unrelated.arxml", "<AUTOSAR />");
  let fullSearchCount = 0;

  const metadataEntries = workspace.entries.filter((entry) => entry.name.endsWith(".dpa") || entry.name.endsWith(".dcf"));
  const project = await discoverVectorProject(workspace.rootPath, metadataEntries, async () => {
    fullSearchCount += 1;
    return workspace.entries.filter((entry) => entry.name.endsWith(".arxml"));
  });

  assert.deepEqual(project.project.metadataFiles.map((file) => file.filePath), [dpaPath, dcfPath]);
  assert.deepEqual(project.projectInputFilePaths, [extraModel, rootModel].sort());
  assert.equal(fullSearchCount, 0);
});

test("follows a selected DCF into its DPA without revisiting their cycle", async (context) => {
  const workspace = await createWorkspace(context);
  const dcfPath = await workspace.addFile(
    "Config/Developer/Project.dcf",
    "<DCF><PROJECTASSISTANT>../../Project.dpa</PROJECTASSISTANT><FILEREF><ARXML>DeveloperModel.arxml</ARXML></FILEREF></DCF>"
  );
  const dpaPath = await workspace.addFile(
    "Project.dpa",
    "<ProjectAssistant><DVWorkspace>Config/Developer/Project.dcf</DVWorkspace><FILE>RootModel.arxml</FILE></ProjectAssistant>"
  );
  const developerModel = await workspace.addFile("Config/Developer/DeveloperModel.arxml", "<AUTOSAR />");
  const rootModel = await workspace.addFile("RootModel.arxml", "<AUTOSAR />");
  await workspace.addFile("Other/Nested/Unrelated.dcf", "<DCF><ARXML>Unrelated.arxml</ARXML></DCF>");
  await workspace.addFile("Other/Nested/Unrelated.arxml", "<AUTOSAR />");
  let fullSearchCount = 0;

  const dcfEntries = workspace.entries.filter((entry) => entry.name.endsWith(".dcf"));
  const project = await discoverVectorProject(workspace.rootPath, dcfEntries, async () => {
    fullSearchCount += 1;
    return workspace.entries.filter((entry) => entry.name.endsWith(".arxml"));
  });

  assert.deepEqual(project.project.metadataFiles.map((file) => file.filePath), [dcfPath, dpaPath]);
  assert.deepEqual(project.projectInputFilePaths, [developerModel, rootModel].sort());
  assert.equal(fullSearchCount, 0);
});

test("starts from a root DCF even when its referenced DPA is also discovered", async (context) => {
  const workspace = await createWorkspace(context);
  const dcfPath = await workspace.addFile(
    "Project.dcf",
    "<DCF><PROJECTASSISTANT>Config/Project.dpa</PROJECTASSISTANT><ARXML>FromDcf.arxml</ARXML></DCF>"
  );
  const dpaPath = await workspace.addFile(
    "Config/Project.dpa",
    "<ProjectAssistant><FILE>FromDpa.arxml</FILE></ProjectAssistant>"
  );
  const dcfModel = await workspace.addFile("FromDcf.arxml", "<AUTOSAR />");
  const dpaModel = await workspace.addFile("Config/FromDpa.arxml", "<AUTOSAR />");

  const metadataEntries = workspace.entries.filter((entry) => entry.name.endsWith(".dpa") || entry.name.endsWith(".dcf"));
  const project = await discoverVectorProject(workspace.rootPath, metadataEntries);

  assert.deepEqual(project.project.metadataFiles.map((file) => file.filePath), [dcfPath, dpaPath]);
  assert.deepEqual(project.projectInputFilePaths, [dpaModel, dcfModel].sort());
});

test("selects ECU model roles without indexing unrelated DPA products", async (context) => {
  const workspace = await createWorkspace(context);
  await workspace.addFile(
    "Project.dpa",
    `<ProjectAssistant><References>
      <DVWorkspace>Config/Developer/Project.dcf</DVWorkspace>
      <FlatMap>Config/System/FlatMap.arxml</FlatMap>
      <FlatECUEX>Config/System/FlatExtract.arxml</FlatECUEX>
      <ECUEX>Config/System/SystemExtract.arxml</ECUEX>
      <McData>Config/McData/Measurements.arxml</McData>
    </References><Folders><ServiceComponents>Config/ServiceComponents</ServiceComponents></Folders></ProjectAssistant>`
  );
  await workspace.addFile(
    "Config/Developer/Project.dcf",
    "<DCF><FILEREF><ARXML>Components/Component.arxml</ARXML></FILEREF></DCF>"
  );
  const developer = await workspace.addFile("Config/Developer/Components/Component.arxml", "<AUTOSAR />");
  const service = await workspace.addFile("Config/ServiceComponents/Service.arxml", "<AUTOSAR />");
  const flatMap = await workspace.addFile("Config/System/FlatMap.arxml", "<AUTOSAR />");
  const flatExtract = await workspace.addFile("Config/System/FlatExtract.arxml", "<AUTOSAR />");
  await workspace.addFile("Config/System/SystemExtract.arxml", "<AUTOSAR />");
  await workspace.addFile("Config/McData/Measurements.arxml", "<AUTOSAR />");
  await workspace.addFile("Config/ECUC/Config.arxml", "<AUTOSAR />");

  const project = await discoverVectorProject(workspace.rootPath, workspace.entries);

  assert.deepEqual(project.projectInputFilePaths, [developer, service, flatExtract, flatMap].sort());
  assert.deepEqual(project.project.vectorEcuInputs, {
    flatMapFilePath: flatMap,
    flatExtractFilePath: flatExtract
  });
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
