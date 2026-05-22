import fs from "node:fs";
import path from "node:path";

export interface AutosarSchemaBundle {
  release: string;
  version: string;
  schemaFile: string;
  sourceUrl: string;
  sha256: string;
}

interface AutosarSchemaManifest {
  source: string;
  namespace: string;
  sharedXmlSchemaFile?: string;
  bundles: AutosarSchemaBundle[];
}

export interface AutosarSchemaSelection extends AutosarSchemaBundle {
  schemaPath: string;
  sharedXmlSchemaPath?: string;
}

export class AutosarSchemaRegistry {
  private readonly manifest: AutosarSchemaManifest;

  constructor(private readonly schemaRoot = path.join(process.cwd(), "resources", "autosar-schemas")) {
    const manifestPath = path.join(schemaRoot, "schema-manifest.json");
    this.manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as AutosarSchemaManifest;
  }

  get namespace() {
    return this.manifest.namespace;
  }

  findBySchemaLocation(schemaLocation: string | undefined) {
    if (!schemaLocation) {
      return undefined;
    }

    const tokens = schemaLocation.split(/\s+/).filter(Boolean);
    const schemaTokens = tokens.filter((token) => /\.xsd$/i.test(token));
    for (const token of schemaTokens) {
      const normalizedToken = normalizeSchemaToken(token);
      const bundle = this.manifest.bundles.find((entry) => {
        const schemaFile = normalizeSchemaToken(entry.schemaFile);
        return schemaFile === normalizedToken || path.basename(schemaFile).toLowerCase() === path.basename(normalizedToken).toLowerCase();
      });
      if (bundle) {
        return this.toSelection(bundle);
      }
    }

    return undefined;
  }

  findByVersion(version: string | undefined) {
    if (!version) {
      return undefined;
    }
    const normalizedVersion = version.trim().toLowerCase();
    const bundle = this.manifest.bundles.find(
      (entry) => entry.version.toLowerCase() === normalizedVersion || entry.release.toLowerCase() === normalizedVersion
    );
    return bundle ? this.toSelection(bundle) : undefined;
  }

  private toSelection(bundle: AutosarSchemaBundle): AutosarSchemaSelection {
    const sharedXmlSchemaPath = this.manifest.sharedXmlSchemaFile
      ? path.join(this.schemaRoot, this.manifest.sharedXmlSchemaFile)
      : undefined;
    return {
      ...bundle,
      schemaPath: path.join(this.schemaRoot, bundle.schemaFile),
      sharedXmlSchemaPath
    };
  }
}

function normalizeSchemaToken(token: string) {
  return token.replace(/\\/g, "/").split("/").filter(Boolean).join("/").toLowerCase();
}
