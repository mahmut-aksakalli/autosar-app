# AUTOSAR Classic Explorer

## Introduction

This is a VS Code extension which is intended to make life easier for software developers/integrators in automotive area. Explore AUTOSAR Classic files(arxml) and projects easily with modern UI and visualization features. 

## Features

Currently, it supports exploring individual arxml files and Vector project workspace in READ-ONLY mode.

- Open a folder containing `.arxml` files in VS Code. If sub folders include Vector project (`.dpa`, `.dcf`), it will automatically find and parse `.arxml` files for whole workspace.
    - ![starting-the-extension](/resources/gifs/starting-the-extension.gif)

- To visualize individual ARXML file, right-click an `.arxml` file in Explorer
    - ![single-file-view](/resources/gifs/single-file-view.gif)

- Explore AUTOSAR Model with tree view, and SWC graph which shows port connections and other SWC instances
    - ![graph-view-swc](/resources/gifs/graph-view-swc.gif)

- View connections between SWCs, and nagivate between SWCs 
    - ![graph-view-swc-click-go-to-port](/resources/gifs/graph-view-swc-click-go-to-port.gif)

- Search for port name and see connection points
    - ![advanced-search-on-graph-view](/resources/gifs/advanced-search-on-graph-view.gif)

- Right Click and go details of SWC internal behavior
    - ![graph-view-swc-right-click-and-go](/resources/gifs/graph-view-swc-right-click-and-go.gif)

- Explore SWCs in tree view, and view different SWC details
    - ![swc-details](/resources/gifs/swc-details.gif)

- Switch between tree view and package explorer. Filter/Search for anything on tree view easily
    - ![explorer-tree-filter-feature](/resources/gifs/explorer-tree-filter-feature.gif)

## Install

```bash
npm install
```

To install the packaged extension locally:

```powershell
code --install-extension .\autosar-model-view-1.0.0.vsix
```

Reload VS Code after installing.

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