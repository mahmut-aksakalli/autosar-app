# AUTOSAR Model View

VS Code extension for exploring AUTOSAR software component and composition models.

## What It Does

The current extension focuses on AUTOSAR model visualization inside VS Code:

- open a VS Code workspace containing `.arxml` files
- open and visualize a single `.arxml` file directly
- recognize Vector DaVinci Developer/Configurator-style project folders from metadata such as `.dpa`, `.dcf`, `.dvgproj`, `.dvgproject`, and `.dvcfg`
- build workspace-level AUTOSAR model context from Vector project metadata-referenced ARXML inputs
- build model graph data from indexed AUTOSAR entities
- visualize SWCs and compositions in a React Flow webview
- browse semantic AUTOSAR model nodes from the VS Code AUTOSAR tree
- open graph, port, runnable, behavior, memory, parameter, and service detail tabs in the model webview
- classify AUTOSAR SWCs by family, including application, parameter, service, service-proxy, sensor-actuator, ECU abstraction, complex driver, nv-block, and composition components
- annotate semantic model entities with AUTOSAR release/version, extraction profile, XML path, `SHORT-NAME` path, owner package path, and completeness metadata
- render `P`, `R`, and `PR` ports with interface-aware metadata and labels for sender-receiver, client-server, parameter, mode-switch, trigger, and NV-data interfaces
- inspect ComSpec init values from numerical, text, resolved constant reference, application, array, and record value specifications
- inspect ports, runnables, connectors, internal variables, memory, parameters, and interface members when available
- navigate AUTOSAR Model mode from the VS Code tree and graph webview without introducing ARXML editor/viewer functionality

The extension intentionally does not port the ARXML viewer/editor, raw XML editor, structured ARXML editor, save flows, or schema validation UI from the desktop app.

## Tech Stack

- `VS Code Extension API` for commands, tree views, file watching, and webviews
- `React` for the model webview UI
- `React Flow` for SWC/composition visualization
- `TypeScript` across extension host and webview code
- `Node.js` for extension-host model services
- `Vite` for webview development and production builds
- `fast-xml-parser` for ARXML model extraction

## Prerequisites

- `Node.js` 22.x is recommended
- `npm` 10.x is recommended
- VS Code compatible with extension engine `^1.92.0`

## Install

```bash
npm install
```

To install the packaged extension locally:

```powershell
code --install-extension .\autosar-model-view-0.0.1.vsix
```

Reload VS Code after installing.

## Development

Open this folder in VS Code and press `F5`.

This launches an Extension Development Host. In that window, open an AUTOSAR workspace and run:

```text
AUTOSAR: Open Model View
```

To visualize one ARXML file without indexing a workspace, right-click an `.arxml` file in Explorer or an editor tab and run:

```text
AUTOSAR: Open ARXML File Model View
```

## Build

Create a production build for both the extension host and webview:

```bash
npm run compile
```

This runs:

- `npm run compile:extension`
- `npm run compile:webview`

Build output goes to:

- `dist/`
- `media/`

Create a local VSIX package:

```bash
npm run package
```

This creates:

```text
autosar-model-view-0.0.1.vsix
```

## Validation Commands

```bash
npm run typecheck
npm test
npm run compile
npm run package
```

The test suite currently covers editor-tab state transitions and extension-host
presentation-detail hydration.

## Local AUTOSAR Schemas

Official AUTOSAR Classic 4.x XML schema files are stored under `resources/autosar-schemas/`.
The folder includes `resources/autosar-schemas/schema-manifest.json`, which maps AUTOSAR
releases to local XSD files and original AUTOSAR source URLs.

The current extension uses `fast-xml-parser` for model extraction. The copied schemas are
available for future offline schema validation work, but schema validation UI is not part of
the current model-view migration.

## Main Scripts

```bash
npm run compile
npm run compile:extension
npm run compile:webview
npm run typecheck
npm test
npm run package
```

## How To Use

1. Install the extension from the VSIX or start it with `F5` in an Extension Development Host.
2. Open a VS Code workspace containing AUTOSAR `.arxml` files, or open a single `.arxml` file.
3. Run `AUTOSAR: Open Model View` for workspace mode.
4. Run `AUTOSAR: Open ARXML File Model View` for single-file mode.
5. When a workspace contains Vector DaVinci metadata, the extension indexes metadata-referenced ARXML inputs.
6. Use the AUTOSAR activity bar view to browse Software Compositions and Software Components.
7. Select compositions, SWCs, graph nodes, ports, runnables, or detail nodes to open the React model webview.
8. Use graph tabs and semantic detail tabs in the webview to inspect the model.

The ARXML fixtures under `examples/` target AUTOSAR Classic 4.4.0 and can be used for local smoke testing.

## Architecture Overview

### Extension Host

The extension host lives under `src/` and is responsible for:

- registering VS Code commands
- registering the AUTOSAR model tree view
- indexing workspace and single-file ARXML inputs
- discovering Vector DaVinci project metadata
- building AUTOSAR semantic model snapshots
- building SWC/composition graph data
- serving graph requests from the webview

Main entry points:

- `src/extension.ts`
- `src/model/workspaceModelService.ts`
- `src/model/modelTreeProvider.ts`

### Webview

The webview lives under `webview/` and is responsible for:

- rendering the tabbed model workspace
- rendering SWC and composition graphs with React Flow
- rendering port, runnable, behavior, memory, parameter, and service detail surfaces
- sending graph requests to the extension host through VS Code webview messaging

The React components are organized by UI responsibility under
`webview/src/components/`:

Key responsibilities:

- `main.tsx` mounts the React application and loads global styles.
- `AutosarApp.tsx` owns the webview message lifecycle and coordinates the active model workspace.
- `EditorTabs/` contains tab types, tab-state helpers, and tab rendering.
- `EditorGraphZone.tsx` coordinates graph selection, composition focus, and detail content.
- `AutosarSwc/` contains the React Flow canvas, graph-query state, and layout calculations. Its `AutosarSwcNode/` subtree groups the node, node menu, ports, and port menu; `SearchBox/` contains graph-search UI and highlighting.
- `SwcDetails/` contains semantic detail surfaces and shared table/formatting utilities. Feature-specific details are grouped into nested folders.
- `vscodeApi.ts` is the typed messaging boundary between the webview and extension host.

### Services

Model services handle:

- ARXML parsing for semantic model extraction
- Vector DaVinci project discovery from workspace metadata
- AUTOSAR semantic reference validation for indexed SWCs, compositions, ports, interfaces, and connector endpoints
- semantic SWC/composition graph generation
- version-aware Classic AUTOSAR extraction metadata for semantic model entities

Key files:

- `src/model/workspaceModelService.ts`
- `src/model/vectorProjectService.ts`
- `src/model/autosarModel.ts`
- `src/model/autosarSemanticValidationService.ts`
- `src/model/autosarVersionAdapters.ts`
- `src/model/graphService.ts`
