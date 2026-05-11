import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

type SmokeError = {
  source: string;
  message: string;
};

type SmokeReport = {
  didFinishLoad: boolean;
  checks: string[];
  errors: SmokeError[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const electronPath = require("electron") as string;
const electronEntry = path.join(repoRoot, "dist-electron", "electron", "main.js");

async function main() {
  const report = await runSmoke();

  if (!report.didFinishLoad) {
    throw new Error("Electron smoke test did not reach did-finish-load.");
  }

  if (report.errors.length > 0) {
    const details = report.errors
      .map((error) => `[${error.source}] ${error.message}`)
      .join("\n");
    throw new Error(`Electron smoke test found runtime issues:\n${details}`);
  }

  process.stdout.write(`Smoke checks passed: ${report.checks.join(", ")}\n`);
}

function runSmoke(): Promise<SmokeReport> {
  return new Promise((resolve, reject) => {
    const reportFile = path.join(
      os.tmpdir(),
      `codex-electron-smoke-${process.pid}-${Date.now()}.json`
    );

    const child = spawn(electronPath, [electronEntry], {
      cwd: repoRoot,
      env: {
        ...process.env,
        CODEX_SMOKE: "1",
        CODEX_SMOKE_TIMEOUT_MS: "15000",
        CODEX_SMOKE_REPORT_FILE: reportFile
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let report: SmokeReport | null = null;

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;

      for (const line of text.split(/\r?\n/)) {
        if (!line.startsWith("__CODEX_SMOKE_REPORT__")) {
          continue;
        }

        try {
          report = JSON.parse(line.replace("__CODEX_SMOKE_REPORT__", "")) as SmokeReport;
        } catch (error) {
          reject(error);
        }
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("exit", (code) => {
      if (!report && fs.existsSync(reportFile)) {
        try {
          report = JSON.parse(fs.readFileSync(reportFile, "utf8")) as SmokeReport;
        } catch (error) {
          reject(error);
          return;
        } finally {
          fs.rmSync(reportFile, { force: true });
        }
      }

      if (report) {
        if (stderr.trim().length > 0) {
          process.stderr.write(stderr);
        }
        resolve(report);
        return;
      }

      const details = [
        `exit code: ${code ?? "unknown"}`,
        stdout.trim() ? `stdout:\n${stdout.trim()}` : "",
        stderr.trim() ? `stderr:\n${stderr.trim()}` : ""
      ]
        .filter(Boolean)
        .join("\n");

      reject(new Error(`Electron smoke test did not produce a report.\n${details}`));
    });
  });
}

void main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
