import fs from "node:fs/promises";
import type { ArxmlDocumentData } from "../../src/shared/contracts.js";
import { WorkspaceService } from "./workspaceService.js";
import { WorkerPool } from "./workerPool.js";

export class ArxmlDocumentService {
  private readonly workerPool = new WorkerPool();

  constructor(private readonly workspaceService: WorkspaceService) {}

  async openDocument(filePath: string) {
    const document = await this.workspaceService.getDocument(filePath);
    this.workspaceService.updateDocument(document);
    return document;
  }

  async previewDocument(filePath: string, content: string) {
    return this.workspaceService.previewDocument(filePath, content);
  }

  async validateDocument(filePath: string, content: string) {
    const document = await this.workspaceService.validateDocument(filePath, content);
    this.workspaceService.updateDocument(document);
    return document;
  }

  closeDocument(filePath: string) {
    return this.workspaceService.closeDocument(filePath);
  }

  async saveDocument(filePath: string, content: string): Promise<ArxmlDocumentData> {
    await fs.writeFile(filePath, content, "utf8");
    const document = await this.workerPool.run<ArxmlDocumentData>({
      type: "parse",
      filePath,
      content,
      validationScope: this.workspaceService.getValidationScope(filePath)
    });
    this.workspaceService.updateDocument(document);
    return document;
  }
}
