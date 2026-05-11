import { Worker } from "node:worker_threads";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workerPath = path.join(__dirname, "workers", "autosarWorker.js");

type WorkerRequest =
  | { type: "parse"; filePath: string; content: string };

export class WorkerPool {
  async run<T>(request: WorkerRequest): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const worker = new Worker(workerPath, {
        workerData: request
      });

      worker.once("message", (message) => {
        resolve(message as T);
        worker.terminate().catch(() => undefined);
      });

      worker.once("error", reject);
      worker.once("exit", (code) => {
        if (code !== 0) {
          reject(new Error(`Worker exited with code ${code}`));
        }
      });
    });
  }
}
