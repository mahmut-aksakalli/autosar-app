import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { _electron as electron, expect, test } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const electronBinary = require("electron") as string;
const electronEntry = path.join(repoRoot, "dist-electron", "electron", "main.js");
const exampleFixture = path.join(repoRoot, "examples", "example-ecu-project.arxml");

test("renders the standards coverage AUTOSAR example in model mode", async () => {
  const electronApp = await electron.launch({
    executablePath: electronBinary,
    args: [electronEntry],
    cwd: repoRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: undefined
    }
  });

  try {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState("domcontentloaded");

    await page.evaluate(async (filePath) => {
      const autosarWindow = window as typeof window & {
        autosarApi: {
          openArxmlFilePath: (path: string) => Promise<unknown>;
        };
      };
      await autosarWindow.autosarApi.openArxmlFilePath(filePath);
    }, exampleFixture);

    await page.getByRole("button", { name: "Model" }).click();
    await expect(page.getByText("AUTOSAR MODEL")).toBeVisible();
    await expect(page.getByText("Application SWCs", { exact: true })).toBeVisible();

    await page.getByText("StandardsCoverageComposition", { exact: true }).click();

    const modelCanvas = page.locator(".model-canvas-shell");
    await expect(modelCanvas).toContainText("SensorInst");
    await expect(modelCanvas).toContainText("EcuAbsInst");
    await expect(modelCanvas).toContainText("ComplexDriverInst");
    await expect(modelCanvas).toContainText("VehicleSpeedOut");

    await page.getByText("ApplicationInst", { exact: true }).first().click();
    await expect(modelCanvas).toContainText("CoverageApplicationSwc");
    await expect(modelCanvas).toContainText("Application");
    await expect(modelCanvas).toContainText("DiagAdminClient");
    await expect(modelCanvas).toContainText("PowerModeIn");
    await expect(modelCanvas).toContainText("ActuatorEnableOut");
    await expect(modelCanvas).toContainText("WakeupDataPr");
  } finally {
    await electronApp.close();
  }
});
