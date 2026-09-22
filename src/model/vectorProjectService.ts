import fs from "node:fs/promises";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import type { ExplorerEntry, VectorProjectMetadataFile, WorkspaceProjectInfo } from "../shared/contracts";

const VECTOR_METADATA_EXTENSIONS = new Map<string, VectorProjectMetadataFile["kind"]>([
  [".dpa", "dpa"],
  [".dcf", "dcf"],
  [".dvgproj", "dvgproj"],
  [".dvgproject", "dvgproj"],
  [".dvcfg", "vector-metadata"]
]);

const DPA_COMPONENT_FOLDER_TAGS = new Set(["servicecomponents", "applicationcomponentfolder"]);
const vectorMetadataParser = new XMLParser({ ignoreAttributes: true, trimValues: true });

const PROJECT_REFERENCE_PATTERN = /(?:file:\/\/\/)?["'(<>\s=]([^"'<>?\r\n]+?\.arxml)\b/gi;
const DCF_REFERENCE_PATTERN = /(?:file:\/\/\/)?["'(<>\s=]([^"'<>?\r\n]+?\.dcf)\b/gi;
const DPA_REFERENCE_PATTERN = /(?:file:\/\/\/)?["'(<>\s=]([^"'<>?\r\n]+?\.dpa)\b/gi;

export interface VectorProjectDiscovery {
  project: WorkspaceProjectInfo;
  projectInputFilePaths: string[];
}

export function isVectorMetadataFile(fileName: string) {
  return VECTOR_METADATA_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

export async function discoverVectorProject(
  rootPath: string,
  explorerEntries: ExplorerEntry[],
  findAllArxmlEntries: () => Promise<ExplorerEntry[]> = async () =>
    explorerEntries.filter((entry) => entry.kind === "file" && entry.name.toLowerCase().endsWith(".arxml"))
): Promise<VectorProjectDiscovery | undefined> {
  const discoveredMetadataFiles = explorerEntries
    .filter((entry) => entry.kind === "file" && isVectorMetadataFile(entry.name))
    .map((entry): VectorProjectMetadataFile => ({
      filePath: entry.filePath,
      relativePath: entry.relativePath,
      kind: VECTOR_METADATA_EXTENSIONS.get(path.extname(entry.name).toLowerCase()) ?? "vector-metadata"
    }))
    .sort(compareMetadataPriority);

  if (discoveredMetadataFiles.length === 0) {
    return undefined;
  }

  // A workspace can contain multiple independent DaVinci projects. Start
  // with the nearest DPA or DCF, then follow only its explicit metadata links.
  const metadataFiles = selectProjectMetadataFiles(discoveredMetadataFiles);
  const visitedMetadataPaths = new Set(metadataFiles.map((file) => normalizePath(file.filePath)));

  const inputsByPath = new Map<string, { filePath: string; sourceMetadataPath?: string }>();
  let hasDeclaredInputs = false;

  for (let index = 0; index < metadataFiles.length; index += 1) {
    const metadataFile = metadataFiles[index];
    if (!metadataFile) {
      continue;
    }

    const result = await collectReferencesFromMetadata(
      rootPath,
      metadataFile.filePath
    );
    hasDeclaredInputs ||= result.hasDeclaredInputs;
    result.references.forEach((filePath) => {
      inputsByPath.set(normalizePath(filePath), {
        filePath,
        sourceMetadataPath: metadataFile.filePath
      });
    });

    // DPA and DCF files can refer to each other. Follow only explicit links
    // from the selected project and visit each metadata file once.
    const linkedMetadata = [
      ...result.dcfReferences.map((filePath) => ({ filePath, kind: "dcf" as const })),
      ...result.dpaReferences.map((filePath) => ({ filePath, kind: "dpa" as const }))
    ];
    for (const linkedFile of linkedMetadata) {
      const normalizedPath = normalizePath(linkedFile.filePath);
      if (visitedMetadataPaths.has(normalizedPath)) {
        continue;
      }
      visitedMetadataPaths.add(normalizedPath);
      metadataFiles.push({
        filePath: linkedFile.filePath,
        relativePath: path.relative(rootPath, linkedFile.filePath),
        kind: linkedFile.kind
      });
    }
  }

  if (inputsByPath.size === 0 && !hasDeclaredInputs) {
    const arxmlEntries = await findAllArxmlEntries();
    const fallbackEntries = selectFallbackArxmlEntries(arxmlEntries, metadataFiles, discoveredMetadataFiles);
    fallbackEntries.forEach((entry) => {
      inputsByPath.set(normalizePath(entry.filePath), {
        filePath: entry.filePath
      });
    });
  }

  const inputFiles = Array.from(inputsByPath.values())
    .map((input) => ({
      filePath: input.filePath,
      relativePath: path.relative(rootPath, input.filePath),
      sourceMetadataPath: input.sourceMetadataPath
    }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  return {
    project: {
      kind: "vector-davinci",
      displayName: inferProjectDisplayName(rootPath, metadataFiles),
      metadataFiles,
      inputFiles,
      indexedInBackground: true,
      indexingStatus: "loading"
    },
    projectInputFilePaths: inputFiles.map((input) => input.filePath)
  };
}

function selectProjectMetadataFiles(metadataFiles: VectorProjectMetadataFile[]) {
  const projectFiles = metadataFiles.filter((file) => file.kind === "dpa" || file.kind === "dcf");
  if (projectFiles.length > 0) {
    const selectedProject = projectFiles.slice().sort(compareProjectPriority)[0];
    return selectedProject ? [selectedProject] : [];
  }

  return metadataFiles;
}

function compareProjectPriority(left: VectorProjectMetadataFile, right: VectorProjectMetadataFile) {
  const depthDifference = getRelativePathDepth(left.relativePath) - getRelativePathDepth(right.relativePath);
  if (depthDifference !== 0) {
    return depthDifference;
  }

  if (left.kind !== right.kind) {
    return left.kind === "dpa" ? -1 : 1;
  }

  return left.relativePath.localeCompare(right.relativePath);
}

function getRelativePathDepth(relativePath: string) {
  return relativePath.split(/[\\/]+/).filter(Boolean).length;
}

function selectFallbackArxmlEntries(
  arxmlEntries: ExplorerEntry[],
  selectedMetadataFiles: VectorProjectMetadataFile[],
  discoveredMetadataFiles: VectorProjectMetadataFile[]
) {
  const selectedDpa = selectedMetadataFiles.find((file) => file.kind === "dpa");
  if (!selectedDpa) {
    return arxmlEntries;
  }

  const selectedDirectory = path.dirname(selectedDpa.filePath);
  const otherDpaFiles = discoveredMetadataFiles.filter(
    (file) => file.kind === "dpa" && file.filePath !== selectedDpa.filePath
  );

  // With two projects in the same directory, unreferenced ARXML files cannot
  // be assigned to either project reliably. In that case, index no fallback
  // files instead of silently combining both projects.
  if (otherDpaFiles.some((file) => normalizePath(path.dirname(file.filePath)) === normalizePath(selectedDirectory))) {
    return [];
  }

  return arxmlEntries.filter((entry) => {
    if (!isFileInsideDirectory(selectedDirectory, entry.filePath)) {
      return false;
    }

    return !otherDpaFiles.some((file) => isFileInsideDirectory(path.dirname(file.filePath), entry.filePath));
  });
}

async function collectReferencesFromMetadata(
  rootPath: string,
  metadataFilePath: string
) {
  const content = await fs.readFile(metadataFilePath, "utf8").catch(() => "");
  const metadataDir = path.dirname(metadataFilePath);
  const references = new Set<string>();
  const dcfReferences = new Set<string>();
  const dpaReferences = new Set<string>();
  let hasDeclaredInputs = false;
  let match: RegExpExecArray | null;

  while ((match = PROJECT_REFERENCE_PATTERN.exec(content))) {
    const rawReference = match[1];
    if (!rawReference) {
      continue;
    }

    hasDeclaredInputs = true;
    const resolvedPath = await resolveProjectReference(rootPath, metadataDir, rawReference, ".arxml");
    if (resolvedPath) {
      references.add(resolvedPath);
    }
  }

  while ((match = DCF_REFERENCE_PATTERN.exec(content))) {
    const rawReference = match[1];
    if (!rawReference) {
      continue;
    }

    hasDeclaredInputs = true;
    const resolvedPath = await resolveProjectReference(rootPath, metadataDir, rawReference, ".dcf");
    if (resolvedPath) {
      dcfReferences.add(resolvedPath);
    }
  }

  while ((match = DPA_REFERENCE_PATTERN.exec(content))) {
    const rawReference = match[1];
    if (!rawReference) {
      continue;
    }

    hasDeclaredInputs = true;
    const resolvedPath = await resolveProjectReference(rootPath, metadataDir, rawReference, ".dpa");
    if (resolvedPath) {
      dpaReferences.add(resolvedPath);
    }
  }

  if (path.extname(metadataFilePath).toLowerCase() === ".dpa") {
    const folderReferences = collectDpaComponentFolderReferences(content);
    hasDeclaredInputs ||= folderReferences.length > 0;
    for (const folderReference of folderReferences) {
      const folderFiles = await resolveDpaFolderReference(rootPath, metadataDir, folderReference);
      folderFiles.forEach((filePath) =>
        references.add(filePath)
      );
    }
  }

  return {
    references: Array.from(references),
    dcfReferences: Array.from(dcfReferences),
    dpaReferences: Array.from(dpaReferences),
    hasDeclaredInputs
  };
}

function collectDpaComponentFolderReferences(content: string) {
  let parsed: unknown;
  try {
    parsed = vectorMetadataParser.parse(content);
  } catch {
    return [];
  }

  const references: string[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") {
      return;
    }

    for (const [rawTagName, value] of Object.entries(node as Record<string, unknown>)) {
      const tagName = rawTagName.split(":").at(-1)?.toLowerCase();
      if (tagName && DPA_COMPONENT_FOLDER_TAGS.has(tagName)) {
        collectXmlTextValues(value).forEach((folderPath) => {
          if (folderPath.trim()) {
            references.push(folderPath.trim());
          }
        });
      } else {
        visit(value);
      }
    }
  };

  visit(parsed);
  return Array.from(new Set(references));
}

function collectXmlTextValues(value: unknown): string[] {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectXmlTextValues);
  }
  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const text = record["#text"] ?? record["_"];
  return text === undefined ? [] : collectXmlTextValues(text);
}

async function resolveDpaFolderReference(
  rootPath: string,
  metadataDir: string,
  rawReference: string
) {
  const cleanedReference = cleanProjectReference(rawReference);
  const candidates = [
    path.resolve(metadataDir, cleanedReference),
    path.resolve(rootPath, cleanedReference),
    path.isAbsolute(cleanedReference) ? path.normalize(cleanedReference) : undefined
  ].filter((candidate): candidate is string => Boolean(candidate));

  const matchingFiles = new Set<string>();
  for (const candidate of candidates) {
    if (normalizePath(candidate) !== normalizePath(rootPath) && !isFileInsideDirectory(rootPath, candidate)) {
      continue;
    }
    const files = await findArxmlFilesInDirectory(candidate);
    files.forEach((filePath) => matchingFiles.add(filePath));
  }
  return Array.from(matchingFiles);
}

async function findArxmlFilesInDirectory(directoryPath: string): Promise<string[]> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findArxmlFilesInDirectory(entryPath)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".arxml")) {
      files.push(entryPath);
    }
  }
  return files;
}

function cleanProjectReference(rawReference: string) {
  let decodedReference = rawReference;
  try {
    decodedReference = decodeURIComponent(rawReference);
  } catch {
    // Keep the original path when it contains a literal percent character.
  }
  return decodedReference.replace(/^file:\/\/\//i, "").replace(/[\\/]/g, path.sep).trim();
}

function isFileInsideDirectory(directoryPath: string, filePath: string) {
  const relativePath = path.relative(directoryPath, filePath);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

async function resolveProjectReference(
  rootPath: string,
  metadataDir: string,
  rawReference: string,
  extension: ".arxml" | ".dcf" | ".dpa"
) {
  const cleanedReference = cleanProjectReference(rawReference);
  const candidates = [
    path.resolve(metadataDir, cleanedReference),
    path.resolve(rootPath, cleanedReference),
    path.isAbsolute(cleanedReference) ? path.normalize(cleanedReference) : undefined
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (!isFileInsideDirectory(rootPath, candidate)) {
      continue;
    }
    const file = await fs.stat(candidate).catch(() => undefined);
    if (file?.isFile() && candidate.toLowerCase().endsWith(extension)) {
      return candidate;
    }
  }

  return undefined;
}

function compareMetadataPriority(left: VectorProjectMetadataFile, right: VectorProjectMetadataFile) {
  const leftPriority = getMetadataPriority(left);
  const rightPriority = getMetadataPriority(right);
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }
  return left.relativePath.localeCompare(right.relativePath);
}

function getMetadataPriority(metadataFile: VectorProjectMetadataFile) {
  if (metadataFile.kind === "dcf" || metadataFile.kind === "dvgproj") {
    return 0;
  }
  if (metadataFile.kind === "dpa") {
    return 1;
  }
  return 2;
}

function inferProjectDisplayName(rootPath: string, metadataFiles: VectorProjectMetadataFile[]) {
  const primary = metadataFiles[0];
  return primary ? path.basename(primary.filePath, path.extname(primary.filePath)) : path.basename(rootPath);
}

function normalizePath(filePath: string) {
  return path.normalize(filePath).toLowerCase();
}
