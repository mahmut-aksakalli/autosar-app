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

export interface VectorProjectDiscovery {
  project: WorkspaceProjectInfo;
  projectInputFilePaths: string[];
}

export function isVectorMetadataFile(fileName: string) {
  return VECTOR_METADATA_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

export async function discoverVectorProject(
  rootPath: string,
  explorerEntries: ExplorerEntry[]
): Promise<VectorProjectDiscovery | undefined> {
  const metadataFiles = explorerEntries
    .filter((entry) => entry.kind === "file" && isVectorMetadataFile(entry.name))
    .map((entry): VectorProjectMetadataFile => ({
      filePath: entry.filePath,
      relativePath: entry.relativePath,
      kind: VECTOR_METADATA_EXTENSIONS.get(path.extname(entry.name).toLowerCase()) ?? "vector-metadata"
    }))
    .sort(compareMetadataPriority);

  if (metadataFiles.length === 0) {
    return undefined;
  }

  const arxmlEntries = explorerEntries.filter(
    (entry) => entry.kind === "file" && entry.name.toLowerCase().endsWith(".arxml")
  );
  const arxmlByNormalizedPath = new Map(arxmlEntries.map((entry) => [normalizePath(entry.filePath), entry]));
  const inputsByPath = new Map<string, { filePath: string; sourceMetadataPath?: string }>();

  for (const metadataFile of metadataFiles) {
    const references = await collectArxmlReferencesFromMetadata(rootPath, metadataFile.filePath, arxmlByNormalizedPath);
    references.forEach((filePath) => {
      inputsByPath.set(normalizePath(filePath), {
        filePath,
        sourceMetadataPath: metadataFile.filePath
      });
    });
  }

  if (inputsByPath.size === 0) {
    arxmlEntries.forEach((entry) => {
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

async function collectArxmlReferencesFromMetadata(
  rootPath: string,
  metadataFilePath: string,
  arxmlByNormalizedPath: Map<string, ExplorerEntry>
) {
  const content = await fs.readFile(metadataFilePath, "utf8").catch(() => "");
  const metadataDir = path.dirname(metadataFilePath);
  const references = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = PROJECT_REFERENCE_PATTERN.exec(content))) {
    const rawReference = match[1];
    if (!rawReference) {
      continue;
    }

    const resolvedPath = resolveProjectReference(rootPath, metadataDir, rawReference, arxmlByNormalizedPath);
    if (resolvedPath) {
      references.add(resolvedPath);
    }
  }

  if (path.extname(metadataFilePath).toLowerCase() === ".dpa") {
    const folderReferences = collectDpaComponentFolderReferences(content);
    const arxmlEntries = Array.from(arxmlByNormalizedPath.values());
    for (const folderReference of folderReferences) {
      resolveDpaFolderReference(rootPath, metadataDir, folderReference, arxmlEntries).forEach((filePath) =>
        references.add(filePath)
      );
    }
  }

  return Array.from(references);
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

function resolveDpaFolderReference(
  rootPath: string,
  metadataDir: string,
  rawReference: string,
  arxmlEntries: ExplorerEntry[]
) {
  const cleanedReference = cleanProjectReference(rawReference);
  const candidates = [
    path.resolve(metadataDir, cleanedReference),
    path.resolve(rootPath, cleanedReference),
    path.isAbsolute(cleanedReference) ? path.normalize(cleanedReference) : undefined
  ].filter((candidate): candidate is string => Boolean(candidate));

  const matchingFiles = new Set<string>();
  for (const candidate of candidates) {
    arxmlEntries.forEach((entry) => {
      if (isFileInsideDirectory(candidate, entry.filePath)) {
        matchingFiles.add(entry.filePath);
      }
    });
  }
  return Array.from(matchingFiles);
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

function resolveProjectReference(
  rootPath: string,
  metadataDir: string,
  rawReference: string,
  arxmlByNormalizedPath: Map<string, ExplorerEntry>
) {
  const cleanedReference = cleanProjectReference(rawReference);
  const candidates = [
    path.resolve(metadataDir, cleanedReference),
    path.resolve(rootPath, cleanedReference),
    path.isAbsolute(cleanedReference) ? path.normalize(cleanedReference) : undefined
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const entry = arxmlByNormalizedPath.get(normalizePath(candidate));
    if (entry) {
      return entry.filePath;
    }
  }

  const referenceTail = normalizePath(cleanedReference);
  const matchingEntry = Array.from(arxmlByNormalizedPath.values()).find((entry) =>
    normalizePath(entry.relativePath).endsWith(referenceTail)
  );
  return matchingEntry?.filePath;
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
