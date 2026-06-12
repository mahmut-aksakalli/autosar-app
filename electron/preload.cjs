const { contextBridge, ipcRenderer } = require("electron");

const api = {
  openWorkspace: () => ipcRenderer.invoke("workspace:open"),
  openArxmlFile: () => ipcRenderer.invoke("workspace:openFile"),
  openWorkspacePath: (rootPath) => ipcRenderer.invoke("workspace:openPath", rootPath),
  openArxmlFilePath: (filePath) => ipcRenderer.invoke("workspace:openFilePath", filePath),
  getWorkspaceState: () => ipcRenderer.invoke("workspace:state"),
  openDocument: (filePath) => ipcRenderer.invoke("document:open", filePath),
  previewDocument: (filePath, content) =>
    ipcRenderer.invoke("document:preview", { filePath, content }),
  saveDocument: (filePath, content) => ipcRenderer.invoke("document:save", { filePath, content }),
  closeDocument: (filePath) => ipcRenderer.invoke("document:close", filePath),
  validateDocument: (filePath, content) => ipcRenderer.invoke("document:validate", { filePath, content }),
  buildGraph: (query) => ipcRenderer.invoke("graph:build", query),
  searchFiles: (query, openDocuments) => ipcRenderer.invoke("search:files", { query, openDocuments }),
  onWorkspaceUpdated: (listener) => {
    const wrapped = (_event, workspace) => {
      listener(workspace);
    };

    ipcRenderer.on("workspace:updated", wrapped);
    return () => ipcRenderer.off("workspace:updated", wrapped);
  },
  onToggleBottomPanel: (listener) => {
    const wrapped = () => {
      listener();
    };

    ipcRenderer.on("view:toggleBottomPanel", wrapped);
    return () => ipcRenderer.off("view:toggleBottomPanel", wrapped);
  }
};

contextBridge.exposeInMainWorld("autosarApi", api);
