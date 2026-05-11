# AUTOSAR App Plan

## Summary
Build a desktop-first AUTOSAR engineering application focused on ARXML viewing/editing first, then standards-aware visualization that grows from individual SWCs to compositions, ECU-local deployment views, and finally whole-system AUTOSAR topology. The plan is broken into small execution steps with checkboxes so progress can be tracked directly in `PLAN.md`.

## Steps
### Step 1 - Core ARXML editor foundation
- [x] 1.1 Define the v1 workbench scope as `Explorer + tabbed editor`.
- [x] 1.2 Keep `File mode` and `Model mode`, with `File mode` as the default primary workflow.
- [x] 1.3 Support both opening a workspace folder and individual arxml files. On workspace, you list other files names as well, tool don't need to support opening them
- [x] 1.4 Render the Explorer as a VS Code-like folder tree with filenames only at leaf nodes.
- [x] 1.5 Open multiple ARXML files in tabs and allow switching without losing in-memory edits.
- [x] 1.6 Keep dual editing modes: raw XML editor and structured field editor backed by the same parsed document.
- [x] 1.7 Add search capabilities to editor.
- [x] 1.8 User should be able to click on a reference on arxml file and editor should jump to there.
- [x] 1.9 Remember the last opened workspace folder and restore it in the Explorer on next app launch without overwriting it when opening a single file.

### Step 2 - SWC visualization architecture
- [x] 2.1 Keep the SWC diagram navigation-first in v1: visualization, selection, inspect, and jump-to-source only.
- [x] 2.2 Use React Flow as the renderer canvas, but keep AUTOSAR graph types as the internal app contract instead of React Flow types.
- [x] 2.3 Extend the AUTOSAR model index to expose stable semantic IDs for SWCs, compositions, component instances, ports, and connector endpoints.
- [x] 2.4 Add a dedicated graph-building service that returns semantic graph data for two scopes: `SWC detail` and `Composition view`.
- [x] 2.5 Replace the current generic graph DTO with shared contracts that include node kind, edge kind, labels, semantic IDs, file path, and XML path.
- [x] 2.6 Keep layout ownership in the renderer: compute initial positions there and do not persist coordinates into ARXML.
- [x] 2.7 Add a dedicated renderer model module with `ModelCanvas`, `ModelInspector`, and `ModelToolbar` instead of expanding `App.tsx` further.
- [x] 2.8 Render individual SWCs with explicit provided/required port visualization and port-level selection metadata.
- [x] 2.9 Render compositions with contained SWCs and edges for assembly/delegation connectors mapped to the correct endpoints.
- [x] 2.10 Support double click on SWC nodes to open the defining file in the editor.
- [x] 2.11 Support double click on ports/connectors to jump to the target XML path in the structured editor.
- [x] 2.12 Handle unresolved references safely by showing degraded graph state and inspector warnings instead of breaking the canvas.
- [x] 2.13 Keep graph extraction/indexing off the renderer thread and limit graph payloads to the requested focus scope for performance.
- [x] 2.14 Add a bottom inspector panel in SWC visualization for internal SWC behavior details such as runnables, calibration variables, inter-runnable variables, and per-instance memory.

### Step 3 - AUTOSAR semantic coverage for SWCs, ports, and interfaces
References:
- [AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf](https://www.autosar.org/fileadmin/standards/R23-11/CP/AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf)
- Sections: `3.2 Software Component`, `3.2.2 PortPrototype`, `3.2.3 AtomicSwComponentType`, `3.2.4 ParameterSwComponentType`, `3.3 Composition`, `3.4 Port Interface`, `4.2 Port Interface Details`
- Tables: `Table 3.1 SwComponentType`, `Table 3.2 PortPrototype`
- [x] 3.1 Replace generic SWC parsing with explicit `swcKind` support for `application`, `composition`, `parameter`, `sensor-actuator`, `ecu-abstraction`, `complex-device-driver`, `service`, `service-proxy`, and `nv-block`.
- [x] 3.2 Extend shared contracts so renderer and Electron both understand `swcKind`, `portKind`, `portInterfaceKind`, and richer connector metadata.
- [x] 3.3 Parse `PR-PORT-PROTOTYPE` in addition to existing `P-PORT-PROTOTYPE` and `R-PORT-PROTOTYPE`.
- [x] 3.4 Preserve `mayBeUnconnected` and similar port-level metadata for inspection and warnings.
- [x] 3.5 Expand interface parsing to support `sender-receiver`, `client-server`, `mode-switch`, `parameter`, `nv-data`, and `trigger`.
- [x] 3.6 Extract interface members for inspector usage: data elements, operations, arguments, application errors, parameters, mode groups, and triggers.
- [x] 3.7 Add UI badges and grouping so each SWC family is visually distinct instead of all appearing as generic SWCs.
- [x] 3.8 Add dedicated rendering behavior for `PR` ports so they are not flattened into only provided or only required.
- [x] 3.9 Add warnings for unsupported or incompatible port/interface combinations instead of silently degrading.
- [x] 3.10 Add parser and graph tests that cover one representative ARXML sample for each SWC family and port/interface family.

### Step 4 - Richer SWC and composition visualization
References:
- [AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf](https://www.autosar.org/fileadmin/standards/R23-11/CP/AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf)
- Sections: `3.3 Composition`, `3.3.2 SwComponentPrototype`, `3.3.3 Connectors`, `3.4 Port Interface`, `4.2.2 Sender Receiver Communication`, `4.2.3 Client Server Communication`, `4.2.4 External Trigger Event Communication`, `4.2.5 Communication of Modes`, `4.2.6 Parameter Communication`
- Constraints: `constr_1032`, `constr_1036`, `constr_1069` to `constr_1084`
- [x] 4.1 Update the model tree to group components by SWC family.
- [x] 4.2 Enrich the SWC inspector with interface-specific sections for operations, parameters, mode declarations, triggers, and nv-data details.
- [ ] 4.3 Show connector compatibility issues based on AUTOSAR interface-kind rules.
- [ ] 4.4 Support compositions that contain the newly supported SWC families without collapsing them back to generic nodes.
  - [x] Keep composition layout to one SWC per row for the standards coverage fixture, including delegated composition ports.
  - [x] Keep composition selections and port navigation from collapsing the view to a single SWC lane.
  - [x] Render composition outer ports on the composition boundary instead of as standalone SWC-like cards.
- [ ] 4.5 Add family-specific icons or glyphs for service, sensor-actuator, ECU abstraction, complex driver, nv-block, and parameter components.
- [ ] 4.6 Add tests for mixed compositions containing application, parameter, service, sensor-actuator, and nv-block components.

### Step 5 - ECU Abstraction and Complex Driver support
References:
- [AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf](https://www.autosar.org/fileadmin/standards/R23-11/CP/AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf)
- Chapter: `10 ECU Abstraction and Complex Drivers`
- Sections: `10.3.1 ECU Abstraction and its AUTOSAR Interfaces`, `10.4 Sensors/Actuators`, `10.5 I/O Hardware Abstraction`, `10.6 Complex Driver`
- Tables: `Table 10.1 SensorActuatorSwComponentType`, `Table 10.2 EcuAbstractionSwComponentType`, `Table 10.3 ComplexDeviceDriverSwComponentType`
- [x] 5.1 Parse `ECU-ABSTRACTION-SW-COMPONENT-TYPE` as a dedicated SWC family.
- [x] 5.2 Parse `COMPLEX-DEVICE-DRIVER-SW-COMPONENT-TYPE` as a dedicated SWC family.
- [ ] 5.3 Extract and expose `hardwareElement` references for ECU abstraction and complex driver components.
- [ ] 5.4 Extract and expose `SwcBswMapping` references where present.
- [ ] 5.5 Show ECU abstraction and complex driver components as ECU-local or hardware-bound elements in the UI.
- [ ] 5.6 Add inspector sections for hardware references and BSW mapping relationships.
- [ ] 5.7 Add warnings when ECU abstraction or complex driver elements are missing expected hardware references.
- [ ] 5.8 Add ARXML tests for ECU abstraction and complex driver examples, including hardware reference extraction.

### Step 6 - System Template foundation
References:
- [AUTOSAR_CP_TPS_SystemTemplate.pdf](https://www.autosar.org/fileadmin/standards/R25-11/CP/AUTOSAR_CP_TPS_SystemTemplate.pdf)
- Sections: `4 Root software composition of a system`, `5 Mapping`, `5.1 Software Component Mapping`, `3.4 Mapping of Topology Entities onto Hardware Elements`
- Tables: `Table 4.1 RootSwCompositionPrototype`, `Table 5.1 SystemMapping`, `Table 5.2 SwcToEcuMapping`, `Table 3.140 ECUMapping`
- [ ] 6.1 Extend the backend index to parse `System` documents from the System Template.
- [ ] 6.2 Parse `RootSwCompositionPrototype` and treat it as the system entry point.
- [ ] 6.3 Parse `SystemMapping`.
- [ ] 6.4 Parse `SwcToEcuMapping`.
- [ ] 6.5 Parse `EcuInstance`.
- [ ] 6.6 Parse `ECUMapping` and preserve links between topology entities and ECU-resource entities where available.
- [ ] 6.7 Parse the system and data mapping entities needed to later derive inter-ECU communication edges.
- [ ] 6.8 Add shared contracts for system-level entities and mapping relationships.
- [ ] 6.9 Add tests for root composition resolution and SWC-to-ECU mapping extraction.

### Step 7 - ECU-level visualization
References:
- [AUTOSAR_CP_TPS_SystemTemplate.pdf](https://www.autosar.org/fileadmin/standards/R25-11/CP/AUTOSAR_CP_TPS_SystemTemplate.pdf)
- Sections: `5.1 SW Component to ECU Mapping`, `3.4.1 ECU Mapping`
- [AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf](https://www.autosar.org/fileadmin/standards/R23-11/CP/AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf)
- Sections: `10.5 I/O Hardware Abstraction`, `10.6 Complex Driver`
- [ ] 7.1 Add a new graph scope: `ecu`.
- [ ] 7.2 Render each `EcuInstance` as a container for mapped SWCs.
- [ ] 7.3 Place ECU abstraction, complex driver, service, and application components inside the mapped ECU context.
- [ ] 7.4 Support recursive mapping behavior from mapped compositions down to contained atomic components.
- [ ] 7.5 Handle exceptions such as multi-ECU mapping of `ParameterSwComponentType` and `ServiceProxySwComponentType`.
- [ ] 7.6 Add drill-down navigation from ECU view into composition view and SWC detail view.
- [ ] 7.7 Add tests for single-ECU and multi-ECU mapping scenarios.

### Step 8 - Whole-system visualization
References:
- [AUTOSAR_CP_TPS_SystemTemplate.pdf](https://www.autosar.org/fileadmin/standards/R25-11/CP/AUTOSAR_CP_TPS_SystemTemplate.pdf)
- Sections: `4 Root software composition of a system`, `5 Mapping`, `5.1 Software Component Mapping`, `5.2` data and signal mapping related sections
- Tables: `Table 4.1 RootSwCompositionPrototype`, `Table 5.1 SystemMapping`, `Table 5.2 SwcToEcuMapping`
- [ ] 8.1 Add a new graph scope: `system`.
- [ ] 8.2 Build the top-level graph from `RootSwCompositionPrototype`.
- [ ] 8.3 Render multiple `EcuInstance` containers in the same system canvas.
- [ ] 8.4 Show which SWCs are deployed on which ECU using `SwcToEcuMapping`.
- [ ] 8.5 Derive inter-ECU edges from system and data mapping information, not only composition-level connectors.
- [ ] 8.6 Distinguish intra-ECU and inter-ECU connections visually.
- [ ] 8.7 Support navigation chain: `System -> ECU -> Composition -> SWC -> Port/Behavior -> XML`.
- [ ] 8.8 Add degraded-state handling for incomplete system descriptions and partial extracts.
- [ ] 8.9 Add end-to-end tests for a small multi-ECU AUTOSAR system sample.

### Step 9 - Quality and usability hardening
References:
- Cross-cutting step covering the compatibility and mapping constraints in [AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf](https://www.autosar.org/fileadmin/standards/R23-11/CP/AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf) and [AUTOSAR_CP_TPS_SystemTemplate.pdf](https://www.autosar.org/fileadmin/standards/R25-11/CP/AUTOSAR_CP_TPS_SystemTemplate.pdf)
- [ ] 9.1 Keep all new parsing and graph building off the renderer thread.
- [ ] 9.2 Add incremental indexing paths so larger multi-ECU workspaces remain responsive.
- [ ] 9.3 Improve warning messages with exact ARXML path and entity context.
- [ ] 9.4 Add sample-workspace fixtures that cover SWC-only, composition, ECU, and whole-system scenarios.
- [x] 9.4.a Expand `examples/example-ecu-project.arxml` with validation coverage for AUTOSAR SWC families, `P/R/PR` ports, composition wiring, ECU abstraction, and complex driver examples.
- [ ] 9.4.b Add a dedicated multi-ECU whole-system sample focused on `EcuInstance`, deployment mapping, and inter-ECU communication.
- [x] 9.4.c Add Playwright-based Electron validation that opens the standards coverage fixture and verifies model rendering end-to-end.
- [ ] 9.4.c Add Playwright-based Electron validation flows that open the example AUTOSAR workspace and verify model rendering, inspectors, navigation, and AUTOSAR-specific node and port coverage.
- [ ] 9.5 Review `README.md` so supported AUTOSAR element coverage is documented clearly.
- [ ] 9.6 Keep `PLAN.md` as the source of truth and update completed boxes after each implementation task.

## Important Interfaces and Public Surface
- `WorkspaceService`: open folder, watch files, maintain workspace snapshot, rebuild on external change.
- `ArxmlDocumentService`: open and save one ARXML document, validate, and return structured editor data.
- `AutosarModelIndex`: expose entities, references, and connections across files for model mode, ECU view, and later system view.
- `GraphService`: produce `swc`, `composition`, `ecu`, and later `system` graph data from the indexed AUTOSAR model.
- Shared contracts should evolve to carry `swcKind`, `portKind`, `portInterfaceKind`, ECU mapping metadata, hardware references, and inter-ECU linkage.
- Renderer UI contract includes an `Explorer tree` for workspace files.
- Renderer UI contract includes a `Tabbed editor` for multi-file editing.
- Renderer UI contract includes an `Editor mode toggle` for raw vs structured editing.
- Renderer UI contract includes `Graph actions` for SWC, composition, ECU, and whole-system visualization.

## Test Plan
- [x] Validate each newly supported SWC family with fixture coverage.
- [x] Validate each port kind and interface kind with parser assertions.
- [ ] Validate ECU abstraction and complex driver hardware reference extraction.
- [ ] Validate root composition resolution from system descriptions.
- [ ] Validate SWC-to-ECU mapping, including recursive composition mapping.
- [ ] Validate parameter and service-proxy multi-ECU edge cases.
- [ ] Validate system graph rendering for multiple ECUs and cross-ECU connections.
- [ ] Validate the renderer with Playwright-based Electron UI flows for model navigation, inspector visibility, node coverage, and jump-to-source behavior.
- [ ] Open a workspace with nested folders and many `.arxml` files; verify tree rendering and correct file opening.
- [ ] Open multiple files in tabs, switch between them, and confirm drafts are preserved.
- [ ] Edit a file in raw mode, save it, and verify the workspace snapshot updates cleanly.
- [ ] Edit a file in structured mode and verify the resulting raw XML stays loadable.
- [ ] Trigger validation issues with malformed XML and confirm the UI reports them without crashing.
- [ ] Modify an `.arxml` file outside the app and verify file watching refreshes the workspace safely.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Prefer `npm run verify:functional` after each functional milestone.

## Assumptions and Defaults
- Desktop Electron app remains the active target.
- Target scope remains AUTOSAR Classic Platform.
- Roadmap priority is `ARXML viewer/editor first`, then `standards-aware visualization`, then `ECU/system-level topology`.
- Primary users are engineers working with local AUTOSAR workspaces.
- Windows remains the main target for now, with later portability kept in mind.
- System visualization should be built on the same shared semantic index as current SWC and composition views.
- Incomplete AUTOSAR models should remain viewable with warnings rather than hard failures.
- Checkboxes are intended to live in `PLAN.md` as a working execution tracker.
