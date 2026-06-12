import fs from "node:fs/promises";
import path from "node:path";
import type { ExplorerEntry, VectorProjectMetadataFile, WorkspaceProjectInfo } from "../../src/shared/contracts.js";

const VECTOR_METADATA_EXTENSIONS = new Map<string, VectorProjectMetadataFile["kind"]>([
  [".dpa", "dpa"],
  [".dcf", "dcf"],
  [".dvgproj", "dvgproj"],
  [".dvgproject", "dvgproj"],
  [".dvcfg", "vector-metadata"]
]);

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

  return Array.from(references);
}

function resolveProjectReference(
  rootPath: string,
  metadataDir: string,
  rawReference: string,
  arxmlByNormalizedPath: Map<string, ExplorerEntry>
) {
  const cleanedReference = decodeURIComponent(rawReference)
    .replace(/^file:\/\/\//i, "")
    .replace(/\//g, path.sep)
    .trim();
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
