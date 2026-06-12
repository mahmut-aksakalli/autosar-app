# AUTOSAR App

Desktop AUTOSAR Application built with Electron, React, TypeScript, Node.js, and Vite.

## What It Does

The current app focuses on local ARXML workspace exploration and editing:

- open a workspace folder containing `.arxml` files
- recognize Vector DaVinci Developer/Configurator-style project folders from metadata such as `.dpa`, `.dcf`, `.dvgproj`, `.dvgproject`, and `.dvcfg`
- build workspace-level AUTOSAR model context from Vector project metadata-referenced ARXML inputs in the background
- show a Model mode loading warning while Vector workspace indexing is still running
- show parsed/indexed ARXML documents once when the Model view loads, with a View menu toggle for later access
- open a single `.arxml` file directly
- browse files in a VS Code-like Explorer tree
- keep multiple ARXML files open in tabs
- edit discovered fields in a structured editor
- search within the active document
- jump from reference values to the referenced node
- build model graph data from indexed AUTOSAR entities
- visualize SWCs and compositions in a dedicated tabbed model workspace
- browse semantic AUTOSAR model nodes and open graph, port, runnable, behavior, and memory detail tabs
- classify AUTOSAR SWCs by family, including application, parameter, service, service-proxy, sensor-actuator, ECU abstraction, complex driver, nv-block, and composition components
- annotate semantic model entities with AUTOSAR release/version, extraction profile, XML path, `SHORT-NAME` path, owner package path, and completeness metadata
- render `P`, `R`, and `PR` ports with interface-aware metadata, service-port status, and port detail labels for sender-receiver, client-server, parameter, mode-switch, trigger, and NV-data interfaces
- inspect ComSpec init values from numerical, text, resolved constant reference, application, array, and record value specifications
- inspect ports and connectors within Model mode
- inspect SWC internals in a bottom panel, including runnables, internal variables, and interface members when available
- navigate AUTOSAR Model mode without switching back to ARXML source: composition clicks open inner composition views and SWC clicks focus the SWC graph while highlighting it in the model explorer
- validate the active ARXML file on demand for syntax, AUTOSAR namespace/schema metadata, local AUTOSAR XSD conformance, and serialization diagnostics
- validate AUTOSAR semantic references for indexed ports, interfaces, component prototypes, and composition connectors

The app also remembers the last opened workspace folder and restores it on the next launch.

## Tech Stack

- `Electron` for the desktop shell and native dialogs
- `React` for the renderer UI
- `React Flow` for SWC/composition visualization
- `TypeScript` across renderer and Electron code
- `Node.js` for backend services and worker-thread execution
- `Vite` for renderer development and production builds

## Project Structure

```text
electron/
  main.ts
  mainIpc.ts
  preload.ts
  preload.cjs
  services/
    appStateService.ts
    arxmlDocumentService.ts
    autosarSemanticValidationService.ts
    autosarVersionAdapters.ts
    arxmlValidationService.ts
    autosarModel.ts
    autosarSchemaRegistry.ts
    graphService.ts
    vectorProjectService.ts
    workerPool.ts
    workspaceService.ts
    xsdValidationEngine.ts
    workers/
      autosarWorker.ts
src/
  App.tsx
  main.tsx
  styles.css
  shared/
    contracts.ts
tests/
  arxmlValidationService.test.ts
  autosarModel.test.ts
resources/
  autosar-schemas/
    schema-manifest.json
    R4.0.3/
    R4.1.3/
    R4.2.2/
    R4.3.1/
    R4.4.0/
    R19-11/
    R20-11/
    R21-11/
    R22-11/
    R23-11/
    R24-11/
    R25-11/
scripts/
  copy-preload.ts
  electron-smoke.ts
PLAN.md
```

## Prerequisites

- `Node.js` 22.22.2
- `npm` 10.9.8
- `Volta` is recommended; the project pins these tool versions in `package.json`.

If Electron's install step fails with a local certificate issuer error, rerun install with Node's system certificate store enabled:

```bash
NODE_OPTIONS=--use-system-ca npm install
```

On Windows `cmd.exe`, use:

```cmd
set NODE_OPTIONS=--use-system-ca&& npm install
```

## Install

```bash
npm install
```

## Development

Run the renderer dev server, Electron TypeScript watch build, and the Electron app together:

```bash
npm run dev
```

## Build

Create a production build for both renderer and Electron:

```bash
npm run build
```

This runs:

- `npm run typecheck`
- `npm run build:renderer`
- `npm run build:electron`

Build output goes to:

- `dist/`
- `dist-electron/`

## Validation Commands

```bash
npm run typecheck
npm test
npm run test:e2e
npm run smoke:app
npm run verify:functional
```

## Local AUTOSAR Schemas

Official AUTOSAR Classic 4.x XML schema files are stored under `resources/autosar-schemas/`
for offline ARXML validation. The folder keeps only the XSD files needed for validation
and `resources/autosar-schemas/schema-manifest.json`, which maps AUTOSAR releases to local XSD
files and original AUTOSAR source URLs.

XSD validation runs on demand from the renderer's `Validate File` action through the
Electron/Node service layer with `xmllint-wasm`, while
`fast-xml-parser` remains responsible for XML well-formedness checks and model extraction.
The shared `resources/autosar-schemas/xml.xsd` file is preloaded for AUTOSAR schemas that
import the standard XML namespace schema.

AUTOSAR publishes these materials for information only. Review AUTOSAR's terms and release
disclaimers before using them beyond local validation.

## Main Scripts

```bash
npm run dev
npm run build
npm run typecheck
npm test
npm run test:e2e
npm run smoke:app
npm run verify:functional
```

## How To Use

1. Start the app with `npm run dev`.
2. Click `Open Folder` to load an AUTOSAR workspace, or `Open File` to inspect a single `.arxml` file.
3. When a folder contains Vector DaVinci metadata, the app treats it as a workspace-level AUTOSAR project and indexes the project ARXML inputs in the background for Model mode.
4. Folders without Vector project metadata remain lazy file browsers; ARXML files are parsed individually when opened.
5. If you switch to Model mode before Vector indexing finishes, the editor view shows a loading warning until the semantic model is ready.
6. Use the Explorer to open ARXML files in tabs.
7. Edit the active file in raw XML or structured mode.
8. Run `Validate File` from the Explorer sidebar when you want syntax/schema diagnostics.
9. Save the active document with the save action or `Ctrl/Cmd+S`.

The ARXML fixtures under `examples/` target AUTOSAR Classic 4.4.0 and validate against
`resources/autosar-schemas/R4.4.0/AUTOSAR_00046.xsd`.

## Architecture Overview

### Renderer

The renderer lives under `src/` and is responsible for:

- workbench layout
- Explorer and tabbed editor UI
- raw XML and structured editing experiences
- in-document search and reference jumps
- model navigation views
- semantic model workspace tabs for graphs and SWC details

Main entry points:

- `src/App.tsx`
- `src/main.tsx`
- `src/shared/contracts.ts`

### Electron Main Process

The Electron layer lives under `electron/` and is responsible for:

- creating the application window
- registering IPC handlers
- opening native file and folder dialogs
- restoring persisted workspace state

Main files:

- `electron/main.ts`
- `electron/mainIpc.ts`
- `electron/preload.ts`

### Services And Workers

Backend services handle:

- workspace indexing and file watching
- Vector DaVinci project discovery from workspace metadata and background indexing of referenced AUTOSAR inputs
- on-demand ARXML syntax, namespace, schema, and serialization validation
- AUTOSAR semantic reference validation for indexed SWCs, compositions, ports, interfaces, and connector endpoints
- ARXML parsing and document loading
- save and preview flows
- model extraction and graph generation
- semantic SWC/composition graph generation for the model canvas, including AUTOSAR SWC kinds, port kinds, and port-interface semantics
- version-aware Classic AUTOSAR extraction metadata for semantic model entities
- app state persistence

Heavy parse/index work is delegated through worker threads so the renderer stays responsive.

Key files:

- `electron/services/workspaceService.ts`
- `electron/services/vectorProjectService.ts`
- `electron/services/arxmlDocumentService.ts`
- `electron/services/autosarModel.ts`
- `electron/services/graphService.ts`
- `electron/services/appStateService.ts`
- `electron/services/workerPool.ts`
- `electron/services/workers/autosarWorker.ts`
