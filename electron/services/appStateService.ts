import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

type AppState = {
  lastWorkspacePath?: string;
};

export class AppStateService {
  async getLastWorkspacePath() {
    const state = await this.readState();
    return state.lastWorkspacePath;
  }

  async setLastWorkspacePath(lastWorkspacePath: string) {
    const state = await this.readState();
    state.lastWorkspacePath = lastWorkspacePath;
    await this.writeState(state);
  }

  private async readState(): Promise<AppState> {
    try {
      const content = await fs.readFile(this.getStateFilePath(), "utf8");
      const parsed = JSON.parse(content) as AppState;
      return typeof parsed === "object" && parsed ? parsed : {};
    } catch {
      return {};
    }
  }

  private async writeState(state: AppState) {
    const stateFilePath = this.getStateFilePath();
    await fs.mkdir(path.dirname(stateFilePath), { recursive: true });
    await fs.writeFile(stateFilePath, JSON.stringify(state, null, 2), "utf8");
  }

  private getStateFilePath() {
    return path.join(app.getPath("userData"), "app-state.json");
  }
}
