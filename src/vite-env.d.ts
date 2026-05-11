/// <reference types="vite/client" />

import type { AutosarApi } from "./shared/contracts";

declare global {
  interface Window {
    autosarApi: AutosarApi;
  }
}

export {};
