import { useEffect, useMemo, useRef, useState } from "react";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import type {
  AutosarEntity,
  ArxmlDocumentData,
  FileSearchResult,
  ExplorerEntry,
  SearchInputDocument,
  StructuredField,
  WorkspaceSnapshot
} from "./shared/contracts";
import { ModelPanel } from "./model/ModelPanel";
import type { ModelWorkspaceTab } from "./model/ModelPanel";
import type { SwcGraphScope } from "./shared/contracts";

type NavigationMode = "file" | "search" | "model";
type FileTreeNode = {
  name: string;
  path: string;
  kind: "folder" | "file";
  filePath?: string;
  openable?: boolean;
  children?: FileTreeNode[];
};
type StructuredTreeNode =
  | {
      id: string;
      kind: "element";
      tagName: string;
      path: string;
      semanticPath?: string;
      labelSuffix?: string;
      labelSuffixPath?: string;
      textValue?: string;
      textValuePath?: string;
      children: StructuredTreeNode[];
    }
  | {
      id: string;
      kind: "field";
      key: string;
      value: string;
      path: string;
      editable: boolean;
    };
type SelectedSearchResult =
  | {
      filePath: string;
      lineNumber: number;
      fileMatchOrdinal: number;
      sameLineOrdinal: number;
      lineText: string;
      matchStart: number;
      matchLength: number;
    }
  | undefined;
type ModelTreeNode = {
  id: string;
  label: string;
  icon?: string;
  focusEntityId?: string;
  preferredScope?: SwcGraphScope;
  preferredNodeId?: string;
  workspaceTab?: ModelWorkspaceTab;
  selectable?: boolean;
  children?: ModelTreeNode[];
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: false,
  allowBooleanAttributes: true
});

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  format: true
});

export function App() {
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [openDocuments, setOpenDocuments] = useState<Record<string, ArxmlDocumentData>>({});
  const [activeFilePath, setActiveFilePath] = useState<string>();
  const [navigationMode, setNavigationMode] = useState<NavigationMode>("file");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("Open an AUTOSAR workspace to begin.");
  const [structuredError, setStructuredError] = useState<string>();
  const [collapsedStructuredPaths, setCollapsedStructuredPaths] = useState<Record<string, true>>({});
  const [collapsedStructuredPathsByFile, setCollapsedStructuredPathsByFile] = useState<
    Record<string, Record<string, true>>
  >({});
  const [activeStructuredFieldPath, setActiveStructuredFieldPath] = useState<string>();
  const [collapsedExplorerPaths, setCollapsedExplorerPaths] = useState<Record<string, true>>({});
  const initializedStructuredFilePathRef = useRef<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchMatchIndex, setActiveSearchMatchIndex] = useState(0);
  const [fileSearchResults, setFileSearchResults] = useState<FileSearchResult[]>([]);
  const [searchPending, setSearchPending] = useState(false);
  const [selectedSearchResult, setSelectedSearchResult] = useState<SelectedSearchResult>(undefined);
  const [pendingStructuredScrollPath, setPendingStructuredScrollPath] = useState<string>();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const sidebarResizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [activeJumpPath, setActiveJumpPath] = useState<string>();
  const [modelFocusEntityId, setModelFocusEntityId] = useState<string>();
  const [modelPreferredScope, setModelPreferredScope] = useState<SwcGraphScope>("swc");
  const [modelPreferredNodeId, setModelPreferredNodeId] = useState<string>();
  const [modelWorkspaceTabs, setModelWorkspaceTabs] = useState<ModelWorkspaceTab[]>([]);
  const [activeModelWorkspaceTabId, setActiveModelWorkspaceTabId] = useState<string>();
  const [collapsedModelPaths, setCollapsedModelPaths] = useState<Record<string, true>>({});
  const initializedModelTreeKeyRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    void window.autosarApi.getWorkspaceState().then((snapshot) => {
      if (snapshot) {
        setWorkspace(snapshot);
        setCollapsedExplorerPaths(collectCollapsedFolderPaths(snapshot));
      }
    });
    return window.autosarApi.onWorkspaceUpdated((snapshot) => {
      setWorkspace(snapshot);
    });
  }, []);

  const activeDocument = activeFilePath ? openDocuments[activeFilePath] : undefined;
  const activeDraft = activeFilePath ? drafts[activeFilePath] ?? activeDocument?.content ?? "" : "";

  useEffect(() => {
    if (!activeFilePath) {
      setStructuredError(undefined);
      return;
    }

    if (!activeDraft) {
      return;
    }

    const timer = window.setTimeout(() => {
      void window.autosarApi
        .previewDocument(activeFilePath, activeDraft)
        .then((preview) => {
          setOpenDocuments((current) => {
            const existing = current[activeFilePath];
            return {
              ...current,
              [activeFilePath]: existing
                ? {
                    ...preview,
                    content: existing.content
                  }
                : preview
            };
          });
          setStructuredError(undefined);
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          setStructuredError(message);
        });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [activeDraft, activeFilePath]);

  const modelEntities = useMemo(() => {
    if (!workspace) {
      return [];
    }
    return workspace.entities
      .filter((entity) => entity.type === "swc" || entity.type === "composition")
      .slice()
      .sort((left, right) => left.shortName.localeCompare(right.shortName));
  }, [workspace]);
  const modelTree = useMemo(() => buildModelTree(workspace), [workspace]);
  const selectedModelFocusEntity = useMemo(
    () =>
      modelEntities.find((entity) => entity.id === modelFocusEntityId) ??
      modelEntities[0],
    [modelEntities, modelFocusEntityId]
  );
  const activeModelWorkspaceTab = useMemo(
    () => modelWorkspaceTabs.find((tab) => tab.id === activeModelWorkspaceTabId) ?? modelWorkspaceTabs[0],
    [activeModelWorkspaceTabId, modelWorkspaceTabs]
  );
  const activeModelFocusEntity = useMemo(
    () =>
      modelEntities.find((entity) => entity.id === activeModelWorkspaceTab?.focusEntityId) ??
      selectedModelFocusEntity,
    [activeModelWorkspaceTab?.focusEntityId, modelEntities, selectedModelFocusEntity]
  );

  const openDocumentList = useMemo(() => Object.values(openDocuments), [openDocuments]);
  const fileTree = useMemo(() => buildFileTree(workspace), [workspace]);
  const structuredTree = useMemo(() => {
    if (!activeDraft) {
      return [];
    }

    try {
      return buildStructuredTree(activeDraft);
    } catch {
      return [];
    }
  }, [activeDraft]);
  const activeDocumentSearchMatches = useMemo(
    () => findStructuredTreeMatches(structuredTree, searchQuery),
    [searchQuery, structuredTree]
  );
  const matchingStructuredPaths = useMemo(
    () => new Set(activeDocumentSearchMatches.map((match) => match.path)),
    [activeDocumentSearchMatches]
  );
  const referenceLookup = useMemo(
    () => buildReferenceLookup(structuredTree),
    [structuredTree]
  );
  const flatFileSearchMatches = useMemo(
    () =>
      fileSearchResults.flatMap((result) =>
        result.matches.map((match) => ({
          filePath: result.filePath,
          relativePath: result.relativePath,
          ...match
        }))
      ),
    [fileSearchResults]
  );
  const groupedFileSearchResults = useMemo(() => {
    let runningIndex = 0;
    return fileSearchResults.map((result) => {
      const items = result.matches.map((match, fileMatchOrdinal) => {
        const normalizedLineText = match.lineText.trim().toLowerCase();
        const sameLineOrdinal =
          result.matches
            .slice(0, fileMatchOrdinal + 1)
            .filter((entry) => entry.lineText.trim().toLowerCase() === normalizedLineText).length - 1;

        const item = {
          ...match,
          fileMatchOrdinal,
          sameLineOrdinal,
          flatIndex: runningIndex
        };
        runningIndex += 1;
        return item;
      });

      return {
        ...result,
        fileName: getSearchResultFileName(result.relativePath),
        items
      };
    });
  }, [fileSearchResults]);
  const activeStructuredSearchPath = useMemo(() => {
    if (!activeFilePath || !selectedSearchResult || selectedSearchResult.filePath !== activeFilePath) {
      return undefined;
    }
    return findBestStructuredSearchPath(structuredTree, searchQuery, selectedSearchResult);
  }, [
    activeFilePath,
    searchQuery,
    selectedSearchResult,
    structuredTree
  ]);
  useEffect(() => {
    if (!activeFilePath) {
      initializedStructuredFilePathRef.current = undefined;
      setActiveStructuredFieldPath(undefined);
      setCollapsedStructuredPaths({});
      return;
    }

    const savedCollapsedPaths = collapsedStructuredPathsByFile[activeFilePath];
    if (savedCollapsedPaths) {
      initializedStructuredFilePathRef.current = activeFilePath;
      setCollapsedStructuredPaths(savedCollapsedPaths);
      return;
    }

    if (initializedStructuredFilePathRef.current === activeFilePath) {
      return;
    }

    initializedStructuredFilePathRef.current = activeFilePath;
    const initialCollapsedPaths = collectCollapsedPaths(structuredTree, 2);
    setCollapsedStructuredPaths(initialCollapsedPaths);
    setCollapsedStructuredPathsByFile((current) => ({
      ...current,
      [activeFilePath]: initialCollapsedPaths
    }));
  }, [activeFilePath, collapsedStructuredPathsByFile, structuredTree]);

  useEffect(() => {
    setActiveSearchMatchIndex(0);
    setSelectedSearchResult(undefined);
  }, [searchQuery]);

  useEffect(() => {
    if (navigationMode !== "search") {
      return;
    }

    const normalizedQuery = searchQuery.trim();
    if (!normalizedQuery) {
      setFileSearchResults([]);
      setSearchPending(false);
      return;
    }

    const openSearchDocuments: SearchInputDocument[] = Object.values(openDocuments).map((document) => ({
      filePath: document.filePath,
      relativePath: document.relativePath,
      content: drafts[document.filePath] ?? document.content
    }));

    let cancelled = false;
    setSearchPending(true);

    const timer = window.setTimeout(() => {
      void window.autosarApi
        .searchFiles(normalizedQuery, openSearchDocuments)
        .then((results) => {
          if (cancelled) {
            return;
          }
          setFileSearchResults(results);
          setSearchPending(false);
        })
        .catch(() => {
          if (cancelled) {
            return;
          }
          setFileSearchResults([]);
          setSearchPending(false);
        });
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [drafts, navigationMode, openDocuments, searchQuery]);

  useEffect(() => {
    if (!activeJumpPath) {
      return;
    }

    revealStructuredPath(activeJumpPath);
    setPendingStructuredScrollPath(activeJumpPath);
  }, [activeJumpPath]);

  useEffect(() => {
    if (!activeStructuredSearchPath) {
      return;
    }

    revealStructuredPath(activeStructuredSearchPath);
    setPendingStructuredScrollPath(activeStructuredSearchPath);
  }, [activeStructuredSearchPath]);

  useEffect(() => {
    if (!pendingStructuredScrollPath) {
      return;
    }

    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(getStructuredDomId(pendingStructuredScrollPath));
      if (!cancelled && target) {
        target.scrollIntoView({
          block: "center"
        });
        setPendingStructuredScrollPath(undefined);
      }
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [collapsedStructuredPaths, pendingStructuredScrollPath, structuredTree]);

  useEffect(() => {
    if (!modelEntities.some((entity) => entity.id === modelFocusEntityId)) {
      setModelFocusEntityId(modelEntities[0]?.id);
      setModelPreferredScope("swc");
      setModelPreferredNodeId(undefined);
    }
  }, [modelEntities, modelFocusEntityId]);

  useEffect(() => {
    if (!selectedModelFocusEntity) {
      setModelWorkspaceTabs((current) => (current.length > 0 ? [] : current));
      setActiveModelWorkspaceTabId((current) => (current ? undefined : current));
      return;
    }

    if (modelWorkspaceTabs.length > 0) {
      return;
    }

    const defaultTab = makeDefaultModelGraphTab(selectedModelFocusEntity, modelPreferredScope, modelPreferredNodeId);
    setModelWorkspaceTabs((current) => {
      if (current.some((tab) => tab.id === defaultTab.id)) {
        return current;
      }
      return [...current.filter((tab) => tab.pinned), defaultTab];
    });
    setActiveModelWorkspaceTabId((current) =>
      current && modelWorkspaceTabs.some((tab) => tab.id === current) ? current : defaultTab.id
    );
  }, [modelPreferredNodeId, modelPreferredScope, modelWorkspaceTabs, selectedModelFocusEntity]);

  useEffect(() => {
    const workspaceKey = workspace ? `${workspace.rootPath}:${workspace.files.length}:${workspace.entities.length}` : undefined;
    if (!workspaceKey) {
      initializedModelTreeKeyRef.current = undefined;
      setCollapsedModelPaths({});
      return;
    }

    if (initializedModelTreeKeyRef.current === workspaceKey) {
      return;
    }

    initializedModelTreeKeyRef.current = workspaceKey;
    setCollapsedModelPaths(collectDefaultCollapsedModelPaths(modelTree));
  }, [modelTree, workspace]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const primaryModifier = event.ctrlKey || event.metaKey;
      if (!primaryModifier) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "s") {
        event.preventDefault();
        void handleSaveDocument();
        return;
      }

      if (key === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (key === "w" && activeFilePath) {
        event.preventDefault();
        void handleCloseDocument(activeFilePath);
        return;
      }

      if (key === "tab" && openDocumentList.length > 1) {
        event.preventDefault();
        const currentIndex = openDocumentList.findIndex((document) => document.filePath === activeFilePath);
        const startIndex = currentIndex >= 0 ? currentIndex : 0;
        const offset = event.shiftKey ? -1 : 1;
        const nextIndex = (startIndex + offset + openDocumentList.length) % openDocumentList.length;
        const nextDocument = openDocumentList[nextIndex];

        if (nextDocument) {
          setActiveFilePath(nextDocument.filePath);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeFilePath, openDocumentList]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const resizeState = sidebarResizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const delta = event.clientX - resizeState.startX;
      const nextWidth = Math.min(520, Math.max(220, resizeState.startWidth + delta));
      setSidebarWidth(nextWidth);
    };

    const handleMouseUp = () => {
      sidebarResizeStateRef.current = null;
      document.body.classList.remove("is-resizing-sidebar");
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  async function handleOpenWorkspace() {
    const result = await window.autosarApi.openWorkspace();
    if (!result) {
      return;
    }
    setWorkspace(result.workspace);
    setStatus(`Opened workspace ${getWorkspaceLabel(result.workspace)}.`);
    setCollapsedExplorerPaths(collectCollapsedFolderPaths(result.workspace));
  }

  async function handleOpenArxmlFile() {
    const result = await window.autosarApi.openArxmlFile();
    if (!result) {
      return;
    }
    const openedDocument = result.document ?? result.firstFile;
    if (!openedDocument) {
      setStatus("Could not open the selected ARXML file.");
      return;
    }

    if (result.workspace && !workspace) {
      setWorkspace(result.workspace);
      setStatus(`Opened ${result.workspace.files[0]?.relativePath ?? "ARXML file"}.`);
      setCollapsedExplorerPaths({});
    } else {
      setStatus(`Opened ${openedDocument.relativePath}.`);
    }

    setOpenDocuments((current) => ({
      ...current,
      [openedDocument.filePath]: openedDocument
    }));
    setDrafts((current) => ({
      ...current,
      [openedDocument.filePath]: current[openedDocument.filePath] ?? openedDocument.content
    }));
    setActiveFilePath(openedDocument.filePath);
    initializedStructuredFilePathRef.current = undefined;
    setActiveStructuredFieldPath(undefined);
  }

  async function handleOpenDocument(filePath: string) {
    const document = await window.autosarApi.openDocument(filePath);
    setOpenDocuments((current) => ({ ...current, [filePath]: document }));
    setDrafts((current) => ({
      ...current,
      [filePath]: current[filePath] ?? document.content
    }));
    setActiveFilePath(filePath);
    initializedStructuredFilePathRef.current = undefined;
    setActiveStructuredFieldPath(undefined);
    setStatus(`Opened ${document.relativePath}.`);
  }

  async function handleOpenDocumentAndReveal(filePath: string, xmlPath?: string) {
    if (!openDocuments[filePath]) {
      await handleOpenDocument(filePath);
    } else {
      setActiveFilePath(filePath);
      initializedStructuredFilePathRef.current = undefined;
      setActiveStructuredFieldPath(undefined);
    }

    setNavigationMode("file");

    if (xmlPath) {
      setActiveJumpPath(xmlPath);
      setStatus(`Jumped to ${xmlPath}.`);
    } else {
      setActiveJumpPath(undefined);
    }
  }

  async function handleSaveDocument() {
    if (!activeFilePath) {
      return;
    }
    await saveDocumentByPath(activeFilePath);
  }

  async function handleCloseDocument(filePath: string) {
    const isDirty = getIsDocumentDirty(filePath, openDocuments, drafts);
    if (isDirty) {
      const label = getDocumentTabLabel(openDocuments[filePath]!);
      const shouldSave = window.confirm(
        `${label} has unsaved changes.\n\nPress OK to save before closing, or Cancel to close without saving.`
      );

      if (shouldSave) {
        const saved = await saveDocumentByPath(filePath);
        if (!saved) {
          return;
        }
      }
    }

    setOpenDocuments((current) => {
      const next = { ...current };
      delete next[filePath];
      setActiveFilePath((activePath) => {
        if (activePath !== filePath) {
          return activePath;
        }

        const remaining = Object.keys(next);
        initializedStructuredFilePathRef.current = undefined;
        setActiveStructuredFieldPath(undefined);
        return remaining[0];
      });
      return next;
    });
    setDrafts((current) => {
      const next = { ...current };
      delete next[filePath];
      return next;
    });
    setCollapsedStructuredPathsByFile((current) => {
      const next = { ...current };
      delete next[filePath];
      return next;
    });
  }

  function handleStructuredFieldChange(field: StructuredField, nextValue: string) {
    if (!activeDocument?.filePath || !field.xmlPath) {
      return;
    }

    try {
      const currentContent = drafts[activeDocument.filePath] ?? activeDocument.content;
      const updatedContent = updateXmlValueAtPath(currentContent, field.xmlPath, nextValue);
      setDrafts((current) => ({
        ...current,
        [activeDocument.filePath]: updatedContent
      }));
      setOpenDocuments((current) => {
        const existing = current[activeDocument.filePath];
        if (!existing) {
          return current;
        }
        return {
          ...current,
          [activeDocument.filePath]: {
            ...existing,
            structuredFields: existing.structuredFields.map((entry) =>
              entry.xmlPath === field.xmlPath ? { ...entry, value: nextValue } : entry
            )
          }
        };
      });
      setStructuredError(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStructuredError(message);
    }
  }

  function toggleStructuredNode(path: string) {
    setCollapsedStructuredPaths((current) => {
      const next = { ...current };
      if (current[path]) {
        delete next[path];
      } else {
        next[path] = true;
      }

      if (activeFilePath) {
        setCollapsedStructuredPathsByFile((saved) => ({
          ...saved,
          [activeFilePath]: next
        }));
      }

      return next;
    });
  }

  function handleStructuredFieldFocus(path: string) {
    setActiveStructuredFieldPath(path);
    revealStructuredPath(path);
  }

  function toggleExplorerNode(path: string) {
    setCollapsedExplorerPaths((current) => {
      if (current[path]) {
        const next = { ...current };
        delete next[path];
        return next;
      }

      return {
        ...current,
        [path]: true
      };
    });
  }

  function handleSearchStep(direction: 1 | -1) {
    if (flatFileSearchMatches.length === 0) {
      return;
    }

    setActiveSearchMatchIndex((current) => {
      const next = (current + direction + flatFileSearchMatches.length) % flatFileSearchMatches.length;
      return next;
    });
  }

  async function handleOpenSearchResult(filePath: string) {
    if (!openDocuments[filePath]) {
      await handleOpenDocument(filePath);
      return;
    }

    setActiveFilePath(filePath);
    initializedStructuredFilePathRef.current = undefined;
    setActiveStructuredFieldPath(undefined);
  }

  function handleReferenceJump(reference: string) {
    const normalizedReference = reference.trim();
    const directTarget = referenceLookup.get(normalizedReference);
    const fallbackTarget =
      directTarget ??
      Array.from(referenceLookup.entries()).find(([semanticPath]) =>
        semanticPath.endsWith(normalizedReference)
      )?.[1];

    if (!fallbackTarget) {
      setStatus(`Could not resolve reference ${normalizedReference}.`);
      return;
    }

    const ancestorPaths = findAncestorPaths(structuredTree, fallbackTarget);
    setCollapsedStructuredPaths((current) => {
      const next = { ...current };
      ancestorPaths.forEach((path) => {
        delete next[path];
      });

      if (activeFilePath) {
        setCollapsedStructuredPathsByFile((saved) => ({
          ...saved,
          [activeFilePath]: next
        }));
      }

      return next;
    });
    setActiveJumpPath(fallbackTarget);
    setStatus(`Jumped to ${normalizedReference}.`);
  }

  function handleSidebarResizeStart(event: React.MouseEvent<HTMLDivElement>) {
    sidebarResizeStateRef.current = {
      startX: event.clientX,
      startWidth: sidebarWidth
    };
    document.body.classList.add("is-resizing-sidebar");
  }

  async function saveDocumentByPath(filePath: string) {
    const document = openDocuments[filePath];
    if (!document) {
      return undefined;
    }

    const content = drafts[filePath] ?? document.content;

    try {
      const saved = await window.autosarApi.saveDocument(filePath, content);
      setOpenDocuments((current) => ({ ...current, [filePath]: saved }));
      setDrafts((current) => ({ ...current, [filePath]: saved.content }));
      setStatus(`Saved ${saved.relativePath}.`);
      return saved;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Could not save ${document.relativePath}: ${message}`);
      return undefined;
    }
  }

  function revealStructuredPath(path: string) {
    const ancestorPaths = findAncestorPaths(structuredTree, path);
    if (ancestorPaths.length === 0) {
      return;
    }

    setCollapsedStructuredPaths((current) => {
      const next = { ...current };
      ancestorPaths.forEach((ancestorPath) => {
        delete next[ancestorPath];
      });

      if (activeFilePath) {
        setCollapsedStructuredPathsByFile((saved) => ({
          ...saved,
          [activeFilePath]: next
        }));
      }

      return next;
    });
  }

  function openModelWorkspaceTab(tab: ModelWorkspaceTab | undefined, pinned = false) {
    if (!tab) {
      return;
    }

    const nextTab = {
      ...tab,
      pinned: pinned || tab.pinned
    };

    setModelWorkspaceTabs((current) => {
      const existingTab = current.find((entry) => entry.id === nextTab.id);
      if (existingTab) {
        if (existingTab.pinned || !nextTab.pinned) {
          return current;
        }
        return current.map((entry) =>
          entry.id === nextTab.id
            ? {
                ...entry,
                pinned: entry.pinned || nextTab.pinned
              }
            : entry
        );
      }

      return [...current.filter((entry) => entry.pinned), nextTab];
    });
    setActiveModelWorkspaceTabId(nextTab.id);
  }

  function activateModelWorkspaceTab(tab: ModelWorkspaceTab) {
    setActiveModelWorkspaceTabId(tab.id);
    setModelFocusEntityId(tab.focusEntityId);
    setModelPreferredScope(tab.preferredScope ?? "swc");
    setModelPreferredNodeId(tab.preferredNodeId);
  }

  function pinModelWorkspaceTab(tabId: string) {
    setModelWorkspaceTabs((current) =>
      current.map((tab) => (tab.id === tabId ? { ...tab, pinned: true } : tab))
    );
  }

  function closeModelWorkspaceTab(tabId: string) {
    setModelWorkspaceTabs((current) => {
      const next = current.filter((tab) => tab.id !== tabId);
      if (activeModelWorkspaceTabId === tabId) {
        setActiveModelWorkspaceTabId(next.at(-1)?.id);
      }
      return next;
    });
  }

  return (
    <div className="app-shell">
      <div className="workspace-shell">
        <nav className="activity-bar" aria-label="Primary Navigation">
          <button
            title="Explorer"
            className={navigationMode === "file" ? "active" : ""}
            onClick={() => setNavigationMode("file")}
            aria-label="Explorer"
          >
            <span className="activity-icon activity-icon-files" aria-hidden="true" />
          </button>
          <button
            title="Search"
            className={navigationMode === "search" ? "active" : ""}
            onClick={() => setNavigationMode("search")}
            aria-label="Search"
          >
            <span className="activity-icon activity-icon-search" aria-hidden="true" />
          </button>
          <button
            title="Model"
            className={navigationMode === "model" ? "active" : ""}
            onClick={() => setNavigationMode("model")}
            aria-label="Model"
          >
            <span className="activity-icon activity-icon-model" aria-hidden="true" />
          </button>
        </nav>

        <main className="layout" style={{ gridTemplateColumns: `${sidebarWidth}px 6px minmax(0, 1fr)` }}>
          <aside className="panel explorer">
            <div className="panel-header">
              <div>
                <span className="panel-eyebrow">
                  {navigationMode === "file"
                    ? "EXPLORER"
                    : navigationMode === "search"
                      ? "SEARCH"
                      : "AUTOSAR MODEL"}
                </span>
              </div>
            </div>
            {navigationMode === "file" && (
              <div className="sidebar-toolbar">
                <div className="sidebar-group">
                  <span className="panel-eyebrow">File Menu</span>
                  <button onClick={handleOpenWorkspace}>Open Folder</button>
                  <button onClick={handleOpenArxmlFile}>Open File</button>
                  <button onClick={() => void handleSaveDocument()} disabled={!activeFilePath}>
                    Save Active File
                  </button>
                </div>
              </div>
            )}
          {navigationMode === "file" ? (
            <div className="explorer-sections">
              <section className="explorer-section">
                <div className="explorer-section-header">OPEN EDITORS</div>
                <div className="open-editors-list">
                  {Object.values(openDocuments).length > 0 ? (
                    openDocumentList.map((document) => (
                      <div
                        key={document.filePath}
                        className={`open-editor-row ${document.filePath === activeFilePath ? "selected" : ""}`}
                      >
                        <button
                          type="button"
                          className="open-editor-entry"
                          onClick={() => {
                            setActiveFilePath(document.filePath);
                          }}
                        >
                          <span className="open-editor-icon" aria-hidden="true">
                            {document.filePath === activeFilePath ? "▾" : "▸"}
                          </span>
                          <span className="tree-label">
                            {getDirtyLabel(document.filePath, getDocumentTabLabel(document), openDocuments, drafts)}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="open-editor-close"
                          onClick={() => void handleCloseDocument(document.filePath)}
                          aria-label={`Close ${getDocumentTabLabel(document)}`}
                        >
                          ×
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="explorer-empty">No open editors</div>
                  )}
                </div>
              </section>
              <section className="explorer-section">
                <div className="explorer-section-header">{getWorkspaceLabel(workspace)}</div>
                <div className="tree">
                  {fileTree.map((node) => (
                    <FileTreeBranch
                      key={node.path}
                      node={node}
                      depth={0}
                      activeFilePath={activeFilePath}
                      collapsedExplorerPaths={collapsedExplorerPaths}
                      onToggleFolder={toggleExplorerNode}
                      onOpenDocument={handleOpenDocument}
                    />
                  ))}
                </div>
              </section>
            </div>
          ) : navigationMode === "search" ? (
            <div className="search-panel">
              <div className="search-panel-toolbar">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  placeholder="Search"
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                <div className="search-panel-actions">
                  <button
                    type="button"
                    onClick={() => handleSearchStep(-1)}
                    disabled={flatFileSearchMatches.length === 0}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSearchStep(1)}
                    disabled={flatFileSearchMatches.length === 0}
                  >
                    Next
                  </button>
                </div>
                <div className="search-panel-count">
                  {flatFileSearchMatches.length > 0
                    ? `${activeSearchMatchIndex + 1}/${flatFileSearchMatches.length}`
                    : "0/0"}
                </div>
              </div>
              <div className="search-results">
                {groupedFileSearchResults.length > 0 ? (
                  groupedFileSearchResults.map((result) => (
                    <section key={result.filePath} className="search-result-group">
                      <div className="search-result-group-header">
                        <strong>{result.fileName}</strong>
                      </div>
                      {result.items.map((match) => (
                        <button
                          key={`${result.filePath}:${match.lineNumber}:${match.flatIndex}`}
                          type="button"
                          className={`search-result-item ${match.flatIndex === activeSearchMatchIndex ? "active" : ""}`}
                          onClick={() => {
                            setActiveSearchMatchIndex(match.flatIndex);
                            setSelectedSearchResult({
                              filePath: result.filePath,
                              lineNumber: match.lineNumber,
                              fileMatchOrdinal: match.fileMatchOrdinal,
                              sameLineOrdinal: match.sameLineOrdinal,
                              lineText: match.lineText,
                              matchStart: match.matchStart,
                              matchLength: match.matchLength
                            });
                            void handleOpenSearchResult(result.filePath);
                          }}
                        >
                          <strong>{getSearchResultPrimaryLabel(match.lineNumber)}</strong>
                          <span>{getSearchResultPreview(match.lineText, match.matchStart, match.matchLength)}</span>
                        </button>
                      ))}
                    </section>
                  ))
                ) : searchPending ? (
                  <div className="explorer-empty">Searching workspace and open editors...</div>
                ) : (
                  <div className="explorer-empty">
                    {searchQuery.trim()
                      ? "No matches in workspace files or open editors"
                      : "Search the workspace and open editors"}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="tree">
              {modelTree.map((node) => (
                <ModelTreeBranch
                  key={node.id}
                  node={node}
                  depth={0}
                  collapsedModelPaths={collapsedModelPaths}
                  selectedEntityId={modelFocusEntityId}
                  selectedNodeId={modelPreferredNodeId}
                  selectedWorkspaceTabId={activeModelWorkspaceTab?.id}
                  onToggle={(nodeId) =>
                    setCollapsedModelPaths((current) => {
                      const nextState = { ...current };
                      if (nextState[nodeId]) {
                        delete nextState[nodeId];
                      } else {
                        nextState[nodeId] = true;
                      }
                      return nextState;
                    })
                  }
                  onSelect={(selection) => {
                    if (!selection.focusEntityId) {
                      return;
                    }
                    setModelFocusEntityId(selection.focusEntityId);
                    setModelPreferredScope(selection.preferredScope ?? "swc");
                    setModelPreferredNodeId(selection.preferredNodeId);
                    openModelWorkspaceTab(selection.workspaceTab);
                  }}
                  onPin={(selection) => {
                    if (!selection.focusEntityId) {
                      return;
                    }
                    setModelFocusEntityId(selection.focusEntityId);
                    setModelPreferredScope(selection.preferredScope ?? "swc");
                    setModelPreferredNodeId(selection.preferredNodeId);
                    openModelWorkspaceTab(selection.workspaceTab, true);
                  }}
                />
              ))}
            </div>
          )}
          </aside>

          <div
            className="sidebar-resizer"
            role="separator"
            aria-label="Resize explorer panel"
            aria-orientation="vertical"
            onMouseDown={handleSidebarResizeStart}
          />

          <section className="panel center-panel">
            <div className="editor-tabs">
              {navigationMode === "model"
                ? modelWorkspaceTabs.map((tab) => (
                    <div
                      key={tab.id}
                      className={`editor-tab ${tab.id === activeModelWorkspaceTab?.id ? "active" : ""}`}
                    >
                      <button
                        type="button"
                        className="editor-tab-button"
                        onClick={() => activateModelWorkspaceTab(tab)}
                        onDoubleClick={() => pinModelWorkspaceTab(tab.id)}
                        title={tab.pinned ? tab.title : `${tab.title} (preview)`}
                      >
                        {tab.title}
                      </button>
                      {modelWorkspaceTabs.length > 1 && (
                        <button
                          type="button"
                          className="editor-tab-close"
                          onClick={() => closeModelWorkspaceTab(tab.id)}
                          aria-label={`Close ${tab.title}`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))
                : openDocumentList.map((document) => (
                    <div
                      key={document.filePath}
                      className={`editor-tab ${document.filePath === activeFilePath ? "active" : ""}`}
                    >
                      <button
                        type="button"
                        className="editor-tab-button"
                        onClick={() => {
                          setActiveFilePath(document.filePath);
                        }}
                      >
                        {getDirtyLabel(document.filePath, getDocumentTabLabel(document), openDocuments, drafts)}
                      </button>
                      <button
                        type="button"
                        className="editor-tab-close"
                        onClick={() => void handleCloseDocument(document.filePath)}
                        aria-label={`Close ${getDocumentTabLabel(document)}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
            </div>
            <div className="editor-view">
              {navigationMode === "model" ? (
                <ModelPanel
                  focusEntity={activeModelFocusEntity}
                  preferredScope={activeModelWorkspaceTab?.preferredScope ?? modelPreferredScope}
                  preferredNodeId={activeModelWorkspaceTab?.preferredNodeId ?? modelPreferredNodeId}
                  activeWorkspaceTab={activeModelWorkspaceTab}
                  onOpenFile={(filePath) => handleOpenDocumentAndReveal(filePath)}
                  onJumpToPath={(filePath, xmlPath) => handleOpenDocumentAndReveal(filePath, xmlPath)}
                />
              ) : activeDocument ? (
                <div className="structured-tree">
                  {structuredError && (
                    <div className="structured-message structured-message-error">
                      Structured view is unavailable until the XML parses cleanly: {structuredError}
                    </div>
                  )}
                  {structuredTree.map((node) => (
                    <StructuredTreeBranch
                      key={node.id}
                      node={node}
                      depth={0}
                      collapsedStructuredPaths={collapsedStructuredPaths}
                      expandedSearchPaths={new Set<string>()}
                      matchingStructuredPaths={matchingStructuredPaths}
                      activeSearchPath={activeStructuredSearchPath}
                      activeJumpPath={activeJumpPath}
                      onToggle={toggleStructuredNode}
                      onFieldFocus={handleStructuredFieldFocus}
                      onFieldChange={handleStructuredFieldChange}
                      onReferenceJump={handleReferenceJump}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state">Open an ARXML file to start editing.</div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function updateXmlValueAtPath(content: string, xmlPath: string, nextValue: string) {
  const parsed = xmlParser.parse(content) as Record<string, unknown>;
  const segments = xmlPath
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      const match = /^(.*?)(?:\[(\d+)\])?$/.exec(segment);
      if (!match) {
        throw new Error(`Invalid XML path segment: ${segment}`);
      }
      return {
        key: match[1] ?? "",
        index: match[2] ? Number(match[2]) : undefined
      };
    });

  let current: unknown = parsed;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!segment) {
      throw new Error("Encountered an empty XML path segment.");
    }

    if (!current || typeof current !== "object") {
      throw new Error(`Could not resolve XML path ${xmlPath}.`);
    }

    const value = (current as Record<string, unknown>)[segment.key];
    current =
      segment.index === undefined
        ? value
        : Array.isArray(value)
          ? value[segment.index]
          : undefined;
  }

  const leaf = segments.at(-1);
  if (!leaf || !current || typeof current !== "object") {
    throw new Error(`Could not resolve XML path ${xmlPath}.`);
  }

  const container = current as Record<string, unknown>;
  if (leaf.index === undefined) {
    container[leaf.key] = nextValue;
  } else {
    const target = container[leaf.key];
    if (!Array.isArray(target)) {
      throw new Error(`Expected an array at ${leaf.key}.`);
    }
    target[leaf.index] = nextValue;
  }

  return xmlBuilder.build(parsed);
}

function formatModelWorkspaceIcon(kind: ModelWorkspaceTab["kind"]) {
  switch (kind) {
    case "graph":
      return "G";
    case "runnables":
    case "runnable":
      return "R";
    case "ports":
    case "port":
      return "P";
    case "interRunnableVariables":
      return "V";
    case "parameters":
      return "K";
    case "perInstanceMemory":
    case "memory":
      return "M";
    case "serviceDependencies":
      return "S";
    case "events":
    case "event":
      return "E";
    case "behavior":
      return "B";
    case "exclusiveAreas":
      return "X";
    default:
      return "D";
  }
}

function formatPortIcon(direction: AutosarEntity["portDirection"]) {
  switch (direction) {
    case "provided":
      return ">";
    case "required":
      return "<";
    case "provided-required":
      return "<>";
    default:
      return "P";
  }
}

function formatSwcKindIcon(kind: AutosarEntity["swcKind"]) {
  switch (kind) {
    case "composition":
      return "C";
    case "application":
      return "A";
    case "parameter":
      return "K";
    case "sensor-actuator":
      return "T";
    case "ecu-abstraction":
      return "E";
    case "complex-device-driver":
      return "D";
    case "service":
      return "S";
    case "service-proxy":
      return "X";
    case "nv-block":
      return "N";
    default:
      return "W";
  }
}

function buildModelTree(workspace: WorkspaceSnapshot | null): ModelTreeNode[] {
  if (!workspace) {
    return [];
  }

  const entities = workspace.entities;
  const compositions = entities
    .filter((entity) => entity.type === "composition")
    .slice()
    .sort((left, right) => left.shortName.localeCompare(right.shortName));
  const swcs = entities
    .filter((entity) => entity.type === "swc")
    .slice()
    .sort((left, right) => left.shortName.localeCompare(right.shortName));
  const portsByOwner = new Map<string, AutosarEntity[]>();
  entities
    .filter((entity) => entity.type === "port" && entity.parentSemanticPath)
    .forEach((port) => {
      const ports = portsByOwner.get(port.parentSemanticPath!) ?? [];
      ports.push(port);
      portsByOwner.set(port.parentSemanticPath!, ports);
    });

  const tree: ModelTreeNode[] = compositions.map((composition) => {
    const children = entities
      .filter(
        (entity) =>
          entity.type === "instance" &&
          entity.parentSemanticPath &&
          composition.semanticPath &&
          entity.parentSemanticPath === composition.semanticPath
      )
      .map((instance) => {
        return {
          id: `${composition.id}:${instance.id}`,
          label: instance.shortName,
          icon: "I",
          focusEntityId: composition.id,
          preferredScope: "composition" as const,
          preferredNodeId: instance.id,
          selectable: true
        };
      })
      .sort((left, right) => left.label.localeCompare(right.label));

    return {
      id: composition.id,
      label: composition.shortName,
      icon: "C",
      focusEntityId: composition.id,
      preferredScope: "composition",
      workspaceTab: makeModelTab(composition, "graph", "Graph", {
        preferredScope: "composition"
      }),
      selectable: true,
      children
    };
  });

  const componentChildren = entities
      .filter((entity) => entity.type === "swc")
      .slice()
      .sort((left, right) => left.shortName.localeCompare(right.shortName))
      .map((swc) => {
        return {
          id: `software-component:${swc.id}`,
          label: swc.shortName,
          icon: formatSwcKindIcon(swc.swcKind),
          focusEntityId: swc.id,
          preferredScope: "swc" as const,
          selectable: true,
          workspaceTab: makeModelTab(swc, "graph", "Graph", {
            preferredScope: "swc"
          }),
          children: buildSwcWorkspaceChildren(swc, portsByOwner.get(swc.semanticPath ?? "") ?? [])
        };
      });
    const componentFamilies = new Map<string, ModelTreeNode[]>();
    componentChildren.forEach((child) => {
      const swc = swcs.find((entity) => `software-component:${entity.id}` === child.id);
      const familyLabel = formatSwcKindLabel(swc?.swcKind);
      const familyChildren = componentFamilies.get(familyLabel) ?? [];
      familyChildren.push(child);
      componentFamilies.set(familyLabel, familyChildren);
    });

    return [
    {
      id: "software-compositions",
      label: "Software Compositions",
      selectable: false,
      children: tree
    },
    {
      id: "software-components",
      label: "Software Components",
      selectable: false,
      children: Array.from(componentFamilies.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([label, children]) => ({
          id: `software-components:${label}`,
          label,
          icon: "F",
          selectable: false,
          children
        }))
    }
  ];
}

function buildSwcWorkspaceChildren(swc: AutosarEntity, ports: AutosarEntity[]): ModelTreeNode[] {
  const inspector = swc.inspector;
  const runnables = inspector?.sections.find((section) => section.id === "runnables")?.items ?? [];
  const interRunnableVariables =
    inspector?.sections.find((section) => section.id === "interRunnableVariables")?.items ?? [];
  const perInstanceMemory = inspector?.sections.find((section) => section.id === "perInstanceMemory")?.items ?? [];
  const parameters = inspector?.sections.find((section) => section.id === "interfaceParameters")?.items ?? [];

  return [
    makeSwcWorkspaceNode(swc, "graph", "Graph"),
    {
      ...makeSwcWorkspaceNode(swc, "runnables", "Runnables"),
      children: runnables.map((runnable) => ({
          id: `${swc.id}:runnable:${runnable.id}`,
          label: runnable.label,
          icon: "R",
        focusEntityId: swc.id,
        preferredScope: "swc" as const,
        selectable: true,
        workspaceTab: makeModelTab(swc, "runnable", `Runnable: ${runnable.label}`, {
          sectionId: "runnables",
          itemId: runnable.id,
          xmlPath: runnable.xmlPath
        })
      }))
    },
    {
      ...makeSwcWorkspaceNode(swc, "ports", "Ports"),
      children: ports
        .slice()
        .sort((left, right) => left.shortName.localeCompare(right.shortName))
        .map((port) => ({
          id: `${swc.id}:port:${port.id}`,
          label: port.shortName,
          icon: formatPortIcon(port.portDirection),
          focusEntityId: swc.id,
          preferredScope: "swc" as const,
          selectable: true,
          workspaceTab: makeModelTab(swc, "port", `Port: ${port.shortName}`, {
            entityId: port.id,
            xmlPath: port.xmlPath
          })
        }))
    },
    makeSwcWorkspaceNode(swc, "interRunnableVariables", "Inter-Runnable Variables", interRunnableVariables.length),
    makeSwcWorkspaceNode(swc, "parameters", "Calibration Parameters", parameters.length),
    makeSwcWorkspaceNode(swc, "perInstanceMemory", "Per-Instance Memory", perInstanceMemory.length),
    makeSwcWorkspaceNode(swc, "serviceDependencies", "Service Needs")
  ];
}

function makeSwcWorkspaceNode(
  swc: AutosarEntity,
  kind: ModelWorkspaceTab["kind"],
  label: string,
  count?: number
): ModelTreeNode {
  return {
    id: `${swc.id}:${kind}`,
    label: count !== undefined ? `${label} (${count})` : label,
    icon: formatModelWorkspaceIcon(kind),
    focusEntityId: swc.id,
    preferredScope: "swc",
    selectable: true,
    workspaceTab: makeModelTab(swc, kind, label, {
      preferredScope: "swc"
    })
  };
}

function makeModelTab(
  entity: AutosarEntity,
  kind: ModelWorkspaceTab["kind"],
  titlePrefix: string,
  options: Partial<ModelWorkspaceTab> = {}
): ModelWorkspaceTab {
  return {
    id: `${entity.id}:${kind}:${options.entityId ?? options.itemId ?? options.preferredNodeId ?? "main"}`,
    title: titlePrefix.includes(":") ? titlePrefix : `${titlePrefix}: ${entity.shortName}`,
    pinned: options.pinned,
    kind,
    focusEntityId: entity.id,
    preferredScope: options.preferredScope,
    preferredNodeId: options.preferredNodeId,
    entityId: options.entityId,
    sectionId: options.sectionId,
    itemId: options.itemId,
    xmlPath: options.xmlPath
  };
}

function makeDefaultModelGraphTab(
  entity: AutosarEntity,
  preferredScope: SwcGraphScope | undefined,
  preferredNodeId: string | undefined
): ModelWorkspaceTab {
  return makeModelTab(entity, "graph", "Graph", {
    preferredScope: preferredScope ?? (entity.type === "composition" ? "composition" : "swc"),
    preferredNodeId
  });
}

function collectDefaultCollapsedModelPaths(nodes: ModelTreeNode[]): Record<string, true> {
  const collapsed: Record<string, true> = {};
  const defaultCollapsedKinds = new Set([
    "ports",
    "runnables",
    "events",
    "behavior",
    "parameters",
    "interRunnableVariables",
    "perInstanceMemory",
    "memory",
    "exclusiveAreas",
    "serviceDependencies"
  ]);

  const visit = (node: ModelTreeNode) => {
    const isSwcWorkspaceRoot = node.children?.length && node.workspaceTab?.kind === "graph";
    const isSwcDetailGroup =
      node.children?.length && node.workspaceTab && defaultCollapsedKinds.has(node.workspaceTab.kind);

    if (isSwcWorkspaceRoot || isSwcDetailGroup) {
      collapsed[node.id] = true;
    }

    node.children?.forEach(visit);
  };

  nodes.forEach(visit);
  return collapsed;
}

function ModelTreeBranch(input: {
  node: ModelTreeNode;
  depth: number;
  collapsedModelPaths: Record<string, true>;
  selectedEntityId?: string;
  selectedNodeId?: string;
  selectedWorkspaceTabId?: string;
  onToggle: (nodeId: string) => void;
  onSelect: (selection: Pick<ModelTreeNode, "focusEntityId" | "preferredScope" | "preferredNodeId" | "workspaceTab">) => void;
  onPin: (selection: Pick<ModelTreeNode, "focusEntityId" | "preferredScope" | "preferredNodeId" | "workspaceTab">) => void;
}) {
  const {
    node,
    depth,
    collapsedModelPaths,
    selectedEntityId,
    selectedNodeId,
    selectedWorkspaceTabId,
    onToggle,
    onSelect,
    onPin
  } = input;
  const hasChildren = Boolean(node.children?.length);
  const collapsed = hasChildren ? Boolean(collapsedModelPaths[node.id]) : false;
  const selected =
    node.selectable &&
    (node.workspaceTab
      ? node.workspaceTab.id === selectedWorkspaceTabId
      : node.focusEntityId === selectedEntityId &&
        Boolean(node.preferredNodeId) &&
        node.preferredNodeId === selectedNodeId);

  return (
    <div className="tree-group">
      <button
        type="button"
        className={`tree-row ${hasChildren ? "tree-folder" : "tree-file"} ${selected ? "selected" : ""}`}
        style={{ paddingLeft: `${10 + depth * 20}px` }}
        onClick={() =>
          node.selectable
            ? onSelect({
                focusEntityId: node.focusEntityId,
                preferredScope: node.preferredScope,
                preferredNodeId: node.preferredNodeId,
                workspaceTab: node.workspaceTab
              })
            : onToggle(node.id)
        }
        onDoubleClick={() => {
          if (!node.selectable) {
            return;
          }

          onPin({
            focusEntityId: node.focusEntityId,
            preferredScope: node.preferredScope,
            preferredNodeId: node.preferredNodeId,
            workspaceTab: node.workspaceTab
          });
        }}
      >
        {hasChildren ? (
          <span
            className={`tree-caret ${collapsed ? "collapsed" : "expanded"}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(node.id);
            }}
          />
        ) : (
          <span className="structured-spacer" />
        )}
        {node.icon && (
          <span className={`model-tree-icon model-tree-icon-${node.icon.toLowerCase()}`} aria-hidden="true">
            {node.icon}
          </span>
        )}
        <span className="tree-label">{node.label}</span>
      </button>
      {hasChildren && !collapsed && (
        <div>
          {node.children?.map((child) => (
            <ModelTreeBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsedModelPaths={collapsedModelPaths}
              selectedEntityId={selectedEntityId}
              selectedNodeId={selectedNodeId}
              selectedWorkspaceTabId={selectedWorkspaceTabId}
              onToggle={onToggle}
              onSelect={onSelect}
              onPin={onPin}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StructuredTreeBranch(input: {
  node: StructuredTreeNode;
  depth: number;
  collapsedStructuredPaths: Record<string, true>;
  expandedSearchPaths: Set<string>;
  matchingStructuredPaths: Set<string>;
  activeSearchPath?: string;
  activeJumpPath?: string;
  onToggle: (path: string) => void;
  onFieldFocus: (path: string) => void;
  onFieldChange: (field: StructuredField, nextValue: string) => void;
  onReferenceJump: (reference: string) => void;
}) {
  const {
    node,
    depth,
    collapsedStructuredPaths,
    expandedSearchPaths,
    matchingStructuredPaths,
    activeSearchPath,
    activeJumpPath,
    onToggle,
    onFieldFocus,
    onFieldChange,
    onReferenceJump
  } = input;

  if (node.kind === "field") {
    const isMatch = matchingStructuredPaths.has(node.path);
    const isActiveMatch = activeSearchPath === node.path;
    const isJumpTarget = activeJumpPath === node.path;
    const isReference = isReferenceValue(node.value);

    return (
      <div className="structured-branch">
        <div
          id={getStructuredDomId(node.path)}
          className={`structured-row ${isMatch ? "search-match" : ""} ${isActiveMatch ? "search-match-active" : ""} ${isJumpTarget ? "jump-target-active" : ""}`}
          style={{ paddingLeft: `${12 + depth * 20}px` }}
        >
          <span className="structured-spacer" />
          <strong>{node.key}</strong>
          <div className="structured-field-cell">
            <input
              value={node.value}
              disabled={!node.editable}
              className={isReference ? "structured-reference-input structured-reference-link" : undefined}
              onFocus={() => onFieldFocus(node.path)}
              onClick={() => {
                if (isReference) {
                  onReferenceJump(node.value.trim());
                }
              }}
              onChange={(event) =>
                onFieldChange(
                  {
                    key: node.key,
                    value: node.value,
                    category: "field",
                    xmlPath: node.path,
                    editable: node.editable
                  },
                  event.target.value
                )
              }
            />
          </div>
        </div>
      </div>
    );
  }

  const isMatch = matchingStructuredPaths.has(node.path);
  const isActiveMatch = activeSearchPath === node.path;
  const isJumpTarget = activeJumpPath === node.path;
  const collapsed = expandedSearchPaths.has(node.path)
    ? false
    : Boolean(collapsedStructuredPaths[node.path]);

  return (
    <div className="structured-branch">
      <div
        id={getStructuredDomId(node.path)}
        className={`structured-row structured-element ${isMatch ? "search-match" : ""} ${isActiveMatch ? "search-match-active" : ""} ${isJumpTarget ? "jump-target-active" : ""}`}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        <button
          type="button"
          className={`structured-toggle ${collapsed ? "collapsed" : "expanded"}`}
          onClick={() => onToggle(node.path)}
          aria-label={collapsed ? `Expand ${node.tagName}` : `Collapse ${node.tagName}`}
          aria-expanded={!collapsed}
        >
          <span className="structured-chevron" aria-hidden="true" />
        </button>
        <strong>{node.tagName}</strong>
        {node.textValue !== undefined && (() => {
          const textValue = node.textValue;
          const isTextReference = isReferenceValue(textValue);

          return (
          <input
            className={isTextReference
              ? "structured-inline-value structured-reference-input structured-reference-link"
              : "structured-inline-value"}
            value={textValue}
            onFocus={() => {
              if (node.textValuePath) {
                onFieldFocus(node.textValuePath);
              }
            }}
            onClick={() => {
              if (isTextReference) {
                onReferenceJump(textValue.trim());
              }
            }}
            onChange={(event) =>
              node.textValuePath
                ? onFieldChange(
                    {
                      key: "#text",
                      value: node.textValue ?? "",
                      category: "field",
                      xmlPath: node.textValuePath,
                      editable: true
                    },
                    event.target.value
                  )
                : undefined
            }
          />
          );
        })()}
        {node.labelSuffix && (
          <input
            className="structured-inline-value"
            value={node.labelSuffix}
            onFocus={() => {
              if (node.labelSuffixPath) {
                onFieldFocus(node.labelSuffixPath);
              }
            }}
            onChange={(event) =>
              node.labelSuffixPath
                ? onFieldChange(
                    {
                      key: "SHORT-NAME",
                      value: node.labelSuffix ?? "",
                      category: "field",
                      xmlPath: node.labelSuffixPath,
                      editable: true
                    },
                    event.target.value
                  )
                : undefined
            }
          />
        )}
      </div>
      {!collapsed &&
        node.children.map((child) => (
          <StructuredTreeBranch
            key={child.id}
            node={child}
            depth={depth + 1}
            collapsedStructuredPaths={collapsedStructuredPaths}
            expandedSearchPaths={expandedSearchPaths}
            matchingStructuredPaths={matchingStructuredPaths}
            activeSearchPath={activeSearchPath}
            activeJumpPath={activeJumpPath}
            onToggle={onToggle}
            onFieldFocus={onFieldFocus}
            onFieldChange={onFieldChange}
            onReferenceJump={onReferenceJump}
          />
        ))}
    </div>
  );
}

function FileTreeBranch(input: {
  node: FileTreeNode;
  depth: number;
  activeFilePath?: string;
  collapsedExplorerPaths: Record<string, true>;
  onToggleFolder: (path: string) => void;
  onOpenDocument: (filePath: string) => Promise<void>;
}) {
  const { node, depth, activeFilePath, collapsedExplorerPaths, onToggleFolder, onOpenDocument } = input;

  if (node.kind === "file" && node.filePath) {
    const isOpenable = node.openable === true;
    return (
      <button
        className={`tree-row tree-file ${activeFilePath === node.filePath ? "selected" : ""} ${!isOpenable ? "disabled" : ""}`}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        onClick={() => {
          if (isOpenable) {
            void onOpenDocument(node.filePath!);
          }
        }}
        disabled={!isOpenable}
        title={isOpenable ? node.name : "Only .arxml files can be opened"}
      >
        <span className="tree-label">{node.name}</span>
      </button>
    );
  }

  const collapsed = Boolean(collapsedExplorerPaths[node.path]);

  return (
    <div className="tree-group">
      <button
        type="button"
        className="tree-row tree-folder"
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        onClick={() => onToggleFolder(node.path)}
      >
        <span className={`tree-caret ${collapsed ? "collapsed" : "expanded"}`} />
        <span className="tree-label">{node.name}</span>
      </button>
      {!collapsed &&
        node.children?.map((child) => (
          <FileTreeBranch
            key={child.path}
            node={child}
            depth={depth + 1}
            activeFilePath={activeFilePath}
            collapsedExplorerPaths={collapsedExplorerPaths}
            onToggleFolder={onToggleFolder}
            onOpenDocument={onOpenDocument}
          />
        ))}
    </div>
  );
}

function buildFileTree(workspace: WorkspaceSnapshot | null): FileTreeNode[] {
  if (!workspace) {
    return [];
  }

  const root: FileTreeNode[] = [];

  for (const entry of workspace.explorerEntries) {
    const parts = entry.relativePath.split(/[\\/]+/).filter(Boolean);
    let currentLevel = root;

    parts.forEach((part, index) => {
      const currentPath = parts.slice(0, index + 1).join("/");
      const isLeaf = index === parts.length - 1;
      const isFile = isLeaf && entry.kind === "file";
      let node = currentLevel.find(
        (entry) => entry.name === part && entry.kind === (isFile ? "file" : "folder")
      );

      if (!node) {
        node = isFile
          ? {
              name: part,
              path: currentPath,
              kind: "file",
              filePath: entry.filePath,
              openable: entry.openable
            }
          : {
              name: part,
              path: currentPath,
              kind: "folder",
              children: []
            };
        currentLevel.push(node);
      }

      if (!isLeaf) {
        if (!node.children) {
          node.children = [];
        }
        currentLevel = node.children;
      }
    });
  }

  return sortTreeNodes(root);
}

function sortTreeNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes
    .map((node) =>
      node.kind === "folder" && node.children
        ? { ...node, children: sortTreeNodes(node.children) }
        : node
    )
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "folder" ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
}

function collectCollapsedFolderPaths(workspace: WorkspaceSnapshot): Record<string, true> {
  const collapsed: Record<string, true> = {};

  for (const entry of workspace.explorerEntries) {
    if (entry.kind === "folder") {
      const normalizedPath = entry.relativePath.split(/[\\/]+/).filter(Boolean).join("/");
      if (normalizedPath) {
        collapsed[normalizedPath] = true;
      }
    }
  }

  return collapsed;
}

function getDocumentTabLabel(document: ArxmlDocumentData) {
  const normalizedPath = document.relativePath || document.filePath;
  const parts = normalizedPath.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? normalizedPath;
}

function getIsDocumentDirty(
  filePath: string,
  openDocuments: Record<string, ArxmlDocumentData>,
  drafts: Record<string, string>
) {
  const document = openDocuments[filePath];
  if (!document) {
    return false;
  }

  return (drafts[filePath] ?? document.content) !== document.content;
}

function getDirtyLabel(
  filePath: string,
  label: string,
  openDocuments: Record<string, ArxmlDocumentData>,
  drafts: Record<string, string>
) {
  return getIsDocumentDirty(filePath, openDocuments, drafts) ? `${label} *` : label;
}

function getWorkspaceLabel(workspace: WorkspaceSnapshot | null) {
  if (!workspace?.rootPath) {
    return "WORKSPACE";
  }

  const parts = workspace.rootPath.split(/[\\/]+/).filter(Boolean);
  return (parts.at(-1) ?? "WORKSPACE").toUpperCase();
}

function getSearchResultFileName(relativePath: string) {
  const parts = relativePath.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? relativePath;
}

function getSearchResultPrimaryLabel(lineNumber: number) {
  return `${lineNumber}`;
}

function getSearchResultPreview(lineText: string, matchStart: number, matchLength: number) {
  const trimmedLine = lineText.trim();
  if (!trimmedLine) {
    return "(blank line)";
  }

  const previewStart = Math.max(0, matchStart - 24);
  const previewEnd = Math.min(lineText.length, matchStart + matchLength + 48);
  const prefix = previewStart > 0 ? "..." : "";
  const suffix = previewEnd < lineText.length ? "..." : "";
  return `${prefix}${lineText.slice(previewStart, previewEnd).trim()}${suffix}`;
}

function formatSwcKindLabel(kind: AutosarEntity["swcKind"]) {
  switch (kind) {
    case "application":
      return "Application SWCs";
    case "parameter":
      return "Parameter SWCs";
    case "sensor-actuator":
      return "Sensor/Actuator SWCs";
    case "ecu-abstraction":
      return "ECU Abstraction SWCs";
    case "complex-device-driver":
      return "Complex Driver SWCs";
    case "service":
      return "Service SWCs";
    case "service-proxy":
      return "Service Proxy SWCs";
    case "nv-block":
      return "NvBlock SWCs";
    default:
      return "Other SWCs";
  }
}

function findBestStructuredSearchPath(
  nodes: StructuredTreeNode[],
  query: string,
  selectedSearchResult: {
    lineNumber: number;
    fileMatchOrdinal: number;
    sameLineOrdinal: number;
    lineText: string;
    matchStart: number;
    matchLength: number;
  }
) {
  const { lineText, matchStart, matchLength, fileMatchOrdinal, sameLineOrdinal } = selectedSearchResult;
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedLine = lineText.trim().toLowerCase();
  if (!normalizedQuery || !normalizedLine) {
    return undefined;
  }

  const xmlLineTarget = parseXmlLineTarget(lineText);
  const matchedText = lineText.slice(matchStart, matchStart + matchLength).trim().toLowerCase();
  const exactXmlMatches: string[] = [];
  const exactShortNameMatches: string[] = [];
  const scoredMatches: Array<{ path: string; score: number }> = [];

  const visit = (node: StructuredTreeNode) => {
    const candidates =
      node.kind === "field"
        ? [node.key, node.value, `${node.key}:${node.value}`]
        : [node.tagName, node.labelSuffix ?? "", node.textValue ?? "", `${node.tagName}:${node.textValue ?? ""}`];

    let score = 0;

    if (xmlLineTarget) {
      if (
        node.kind === "element" &&
        xmlLineTarget.tagName === "short-name" &&
        (node.labelSuffix ?? "").trim() === xmlLineTarget.textValue
      ) {
        exactShortNameMatches.push(node.path);
      }

      if (
        node.kind === "element" &&
        node.tagName.toLowerCase() === xmlLineTarget.tagName &&
        (node.textValue ?? "").trim() === xmlLineTarget.textValue
      ) {
        exactXmlMatches.push(node.path);
      } else if (
        node.kind === "field" &&
        node.key.toLowerCase() === xmlLineTarget.tagName &&
        node.value.trim() === xmlLineTarget.textValue
      ) {
        exactXmlMatches.push(node.path);
      } else if (node.kind === "field") {
        if (
          node.key.toLowerCase() === xmlLineTarget.tagName &&
          node.value.toLowerCase().includes(xmlLineTarget.textValue.toLowerCase())
        ) {
          score = Math.max(score, 420 + xmlLineTarget.textValue.length);
        }
      } else if (
        node.tagName.toLowerCase() === xmlLineTarget.tagName &&
        (node.textValue ?? "").toLowerCase().includes(xmlLineTarget.textValue.toLowerCase())
      ) {
        score = Math.max(score, 440 + xmlLineTarget.textValue.length);
      }
    }

    for (const candidate of candidates) {
      const normalizedCandidate = candidate.trim().toLowerCase();
      if (!normalizedCandidate) {
        continue;
      }

      if (normalizedLine.includes(normalizedCandidate)) {
        score = Math.max(score, 100 + normalizedCandidate.length);
      }
      if (matchedText && normalizedCandidate.includes(matchedText)) {
        score = Math.max(score, 180 + normalizedCandidate.length);
      }
      if (normalizedCandidate.includes(normalizedQuery)) {
        score = Math.max(score, 60 + normalizedCandidate.length);
      }
      if (normalizedLine.includes(normalizedQuery) && normalizedCandidate === normalizedQuery) {
        score = Math.max(score, 140 + normalizedCandidate.length);
      }
    }

    if (score > 0) {
      scoredMatches.push({
        path: node.path,
        score
      });
    }

    if (node.kind === "element") {
      node.children.forEach(visit);
    }
  };

  nodes.forEach(visit);
  if (exactShortNameMatches.length > 0) {
    const shortNameIndex = Math.min(sameLineOrdinal, exactShortNameMatches.length - 1);
    return exactShortNameMatches[shortNameIndex];
  }

  if (exactXmlMatches.length > 0) {
    const exactIndex = Math.min(sameLineOrdinal, exactXmlMatches.length - 1);
    return exactXmlMatches[exactIndex];
  }

  if (scoredMatches.length === 0) {
    return undefined;
  }

  const topScore = Math.max(...scoredMatches.map((match) => match.score));
  const strongestMatches = scoredMatches.filter((match) => match.score === topScore);
  const strongestIndex = Math.min(fileMatchOrdinal, strongestMatches.length - 1);
  if (strongestIndex >= 0) {
    return strongestMatches[strongestIndex]?.path;
  }

  return scoredMatches[0]?.path;
}

function parseXmlLineTarget(lineText: string) {
  const trimmed = lineText.trim();
  const exactTagMatch = /^<([A-Z0-9-_]+)(?:\s+[^>]*)?>(.*)<\/\1>$/i.exec(trimmed);
  if (exactTagMatch) {
    return {
      tagName: exactTagMatch[1]?.toLowerCase() ?? "",
      textValue: (exactTagMatch[2] ?? "").trim()
    };
  }

  const fuzzyTagMatch = /<([A-Z0-9-_]+)(?:\s+[^>]*)?>([^<]+)/i.exec(trimmed);
  if (fuzzyTagMatch) {
    return {
      tagName: fuzzyTagMatch[1]?.toLowerCase() ?? "",
      textValue: (fuzzyTagMatch[2] ?? "").trim()
    };
  }

  return undefined;
}

function buildStructuredTree(content: string): StructuredTreeNode[] {
  const parsed = xmlParser.parse(content) as Record<string, unknown>;
  return Object.entries(parsed)
    .filter(([key]) => !key.startsWith("?"))
    .flatMap(([tagName, value]) => buildStructuredNodes(tagName, value, `/${tagName}`, []));
}

function collectCollapsedPaths(
  nodes: StructuredTreeNode[],
  maxExpandedDepth: number
): Record<string, true> {
  const collapsed: Record<string, true> = {};

  const visit = (node: StructuredTreeNode, depth: number) => {
    if (node.kind === "element") {
      if (depth > maxExpandedDepth) {
        collapsed[node.path] = true;
      }

      node.children.forEach((child) => visit(child, depth + 1));
    }
  };

  nodes.forEach((node) => visit(node, 0));
  return collapsed;
}

function findStructuredTreeMatches(nodes: StructuredTreeNode[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [] as Array<{ path: string; ancestorPaths: string[]; label: string }>;
  }

  const matches: Array<{ path: string; ancestorPaths: string[]; label: string }> = [];
  const visit = (node: StructuredTreeNode, ancestors: string[]) => {
    const haystack =
      node.kind === "element"
        ? `${node.tagName} ${node.labelSuffix ?? ""}`.toLowerCase()
        : `${node.key} ${node.value}`.toLowerCase();

    if (haystack.includes(normalizedQuery)) {
      matches.push({
        path: node.path,
        ancestorPaths: ancestors,
        label:
          node.kind === "element"
            ? `${node.tagName}${node.labelSuffix ? ` ${node.labelSuffix}` : ""}`
            : `${node.key}: ${node.value}`
      });
    }

    if (node.kind === "element") {
      node.children.forEach((child) => visit(child, [...ancestors, node.path]));
    }
  };

  nodes.forEach((node) => visit(node, []));
  return matches;
}

function collectExpandedSearchPaths(matches: Array<{ path: string; ancestorPaths: string[] }>) {
  const expanded = new Set<string>();
  matches.forEach((match) => {
    match.ancestorPaths.forEach((path) => expanded.add(path));
  });
  return expanded;
}

function buildStructuredNodes(
  tagName: string,
  value: unknown,
  path: string,
  semanticSegments: string[]
): StructuredTreeNode[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      buildStructuredNodes(tagName, entry, `${path}[${index}]`, semanticSegments)
    );
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [
      {
        id: path,
        kind: "field",
        key: tagName,
        value: String(value),
        path,
        editable: true
      }
    ];
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const shortName = extractStructuredShortName(record);
  const textValue = extractStructuredTextValue(record);
  const nextSemanticSegments = shortName ? [...semanticSegments, shortName] : semanticSegments;
  const attributeNodes = Object.entries(record)
    .filter(([key, entry]) => key.startsWith("@_") && isLeafStructuredValue(entry))
    .map(([key, entry]) => ({
      id: `${path}/${key}`,
      kind: "field" as const,
      key: key.slice(2),
      value: String(entry),
      path: `${path}/${key}`,
      editable: true
    }));
  const childNodes = Object.entries(record)
    .filter(([key]) => !key.startsWith("@_"))
    .flatMap(([key, entry]) => {
      if (key === "SHORT-NAME" && shortName !== undefined) {
        return [];
      }
      if (key === "#text" && textValue !== undefined) {
        return [];
      }

      if (isLeafStructuredValue(entry)) {
        return [
          {
            id: `${path}/${key}`,
            kind: "field" as const,
            key,
            value: String(entry),
            path: `${path}/${key}`,
            editable: true
          }
        ];
      }

      return buildStructuredNodes(key, entry, `${path}/${key}`, nextSemanticSegments);
    });

  return [
    {
      id: path,
      kind: "element",
      tagName,
      path,
      semanticPath: shortName ? `/${nextSemanticSegments.join("/")}` : undefined,
      labelSuffix: shortName,
      labelSuffixPath: shortName !== undefined ? `${path}/SHORT-NAME` : undefined,
      textValue,
      textValuePath: textValue !== undefined ? `${path}/#text` : undefined,
      children: [...attributeNodes, ...childNodes]
    }
  ];
}

function extractStructuredShortName(record: Record<string, unknown>) {
  const value = record["SHORT-NAME"];
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return undefined;
}

function extractStructuredTextValue(record: Record<string, unknown>) {
  const value = record["#text"];
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return undefined;
}

function isLeafStructuredValue(value: unknown): value is string | number | boolean {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function buildReferenceLookup(nodes: StructuredTreeNode[]) {
  const lookup = new Map<string, string>();

  const visit = (node: StructuredTreeNode) => {
    if (node.kind === "element") {
      if (node.semanticPath) {
        lookup.set(node.semanticPath, node.path);
      }
      node.children.forEach(visit);
    }
  };

  nodes.forEach(visit);
  return lookup;
}

function findAncestorPaths(
  nodes: StructuredTreeNode[],
  targetPath: string,
  ancestors: string[] = []
): string[] {
  for (const node of nodes) {
    if (node.path === targetPath) {
      return ancestors;
    }

    if (node.kind === "element") {
      const nested = findAncestorPaths(node.children, targetPath, [...ancestors, node.path]);
      if (nested.length > 0 || node.children.some((child) => child.path === targetPath)) {
        return nested;
      }
    }
  }

  return [];
}

function isReferenceValue(value: string) {
  return value.trim().startsWith("/");
}

function getStructuredDomId(path: string) {
  return `structured-${encodeURIComponent(path)}`;
}
