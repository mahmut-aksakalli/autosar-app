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

### Step 4 - ARXML syntax, schema, and serialization validation
References:
- [AUTOSAR_FO_TPS_ARXMLSerializationRules.pdf](https://www.autosar.org/fileadmin/standards/R25-11/FO/AUTOSAR_FO_TPS_ARXMLSerializationRules.pdf)
- [AUTOSAR_FO_TPS_XMLSchemaProductionRules.pdf](https://www.autosar.org/fileadmin/standards/R23-11/FO/AUTOSAR_FO_TPS_XMLSchemaProductionRules.pdf)
- Scope: XML well-formedness, AUTOSAR namespace/release detection, XSD validation, and AUTOSAR ARXML serialization-rule checks.
- [ ] 4.1 Add an explicit ARXML validation service in the Electron backend, separate from model extraction, so validation can run for open, preview, save, workspace refresh, and future batch validation flows.
- [ ] 4.2 Report XML well-formedness errors before semantic parsing, including parser message, line, column when available, file path, and a stable issue code.
- [ ] 4.3 Detect AUTOSAR namespace, declared schema location, and AUTOSAR release/version hints from the root `AUTOSAR` element.
- [ ] 4.4 Warn when the root namespace is missing, not the AUTOSAR namespace, or uses an unsupported namespace/prefix form for the selected validation mode.
- [ ] 4.5 Add a schema registry abstraction that maps detected or user-selected AUTOSAR releases to local XSD files without hard-coding paths inside parser code.
  - [x] Download official AUTOSAR Classic 4.x schema bundles locally under `resources/autosar-schemas/` for offline validation.
- [ ] 4.6 Validate ARXML documents against the selected AUTOSAR XSD and surface structural schema errors with file, path, message, severity, and source category.
- [ ] 4.7 Define validation scopes for `single-file`, `workspace`, and future `batch` runs so individual SWC extracts can be validated without pretending the whole AUTOSAR project is present.
- [ ] 4.8 Support workspace-level validation of ARXML fragments while preserving per-file results, because AUTOSAR projects are commonly split across many `.arxml` files.
- [ ] 4.9 Add serialization-rule checks that XSD alone does not cover, including namespace usage, `xsi:schemaLocation` shape, unsupported extra namespaces, and root/schema consistency.
- [ ] 4.10 Add validation result contracts in `src/shared/` that distinguish `syntax`, `namespace`, `schema`, and `serialization` issues from later semantic/model issues.
- [ ] 4.11 Carry validation scope and completeness metadata in document/workspace results so the UI can explain whether diagnostics came from one file or a full workspace.
- [ ] 4.12 Show syntax/schema/serialization validation issues in the renderer without blocking read-only exploration of partially valid files.
- [ ] 4.13 Add fixtures for malformed XML, missing namespace, wrong namespace, missing schema location, unsupported schema version, schema-invalid ARXML structure, and schema-valid standalone SWC extracts.
- [ ] 4.14 Add unit tests for validation issue normalization and functional tests that verify invalid ARXML files produce actionable UI diagnostics.

### Step 5 - AUTOSAR reference and semantic validation
References:
- [AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf](https://www.autosar.org/fileadmin/standards/R23-11/CP/AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf)
- [AUTOSAR_CP_TPS_SystemTemplate.pdf](https://www.autosar.org/fileadmin/standards/R25-11/CP/AUTOSAR_CP_TPS_SystemTemplate.pdf)
- Scope: single-file and workspace model/reference resolution plus AUTOSAR semantic validation rules for the currently supported Classic Platform model surface.
- [ ] 5.1 Build one AUTOSAR model index implementation that can be populated from either a single ARXML file or a full workspace.
- [ ] 5.2 Add version-aware semantic extractor interfaces that convert generic XML nodes into app-level AUTOSAR entities instead of binding the renderer to XSD-generated XML shapes.
- [ ] 5.3 Implement a shared Classic AUTOSAR extractor foundation for common `4.x` structures, then isolate version-specific differences behind adapters selected from namespace/schema metadata.
- [ ] 5.4 Add focused extractors for SWCs, ports, interfaces, compositions, component prototypes, connectors, runnables, events, memory, calibration data, ECU mappings, and hardware references as each feature becomes supported.
- [ ] 5.5 Keep extractor output stable across AUTOSAR versions by mapping version-specific XML differences into shared semantic contracts used by the rest of the app.
- [ ] 5.6 Record semantic paths, XML paths, entity kinds, `SHORT-NAME` chains, defining file, owning package, validation scope, model completeness, AUTOSAR version, and raw XML source pointers for every supported entity.
- [ ] 5.7 Build the model index first, then resolve references in a separate pass so cross-file links and forward references can be handled consistently.
- [ ] 5.8 Resolve `*-REF` and `*-TREF` values against the currently available index, using single-file mode for isolated SWC extracts and workspace mode for project folders.
- [ ] 5.9 Classify references as `resolved-local`, `resolved-workspace`, `external`, `unresolved`, or `wrong-kind` instead of flattening every missing target into the same warning.
- [ ] 5.10 In single-file mode, treat well-formed references to missing outside entities as `external` or incomplete-context warnings so standalone SWC descriptions remain useful and viewable.
- [ ] 5.11 In workspace mode, escalate missing cross-file references to unresolved-reference diagnostics when the target should be present in the loaded project.
- [ ] 5.12 Validate that resolved references point to the expected AUTOSAR destination kind, including port interfaces, SWC types, component prototypes, ports, runnables, events, connectors, ECU instances, mappings, and hardware references as support grows.
- [ ] 5.13 Report reference diagnostics with the source XML path, reference value, expected destination, resolved status, validation scope, AUTOSAR version, and nearest owning AUTOSAR entity.
- [ ] 5.14 Detect duplicate or ambiguous semantic paths that would make reference resolution unsafe.
- [ ] 5.15 Validate port/interface compatibility for `P`, `R`, and `PR` ports, including sender-receiver, client-server, mode-switch, parameter, nv-data, and trigger interfaces when the interface definition is available.
- [ ] 5.16 Preserve port and connector display when interface definitions or connector endpoints are external to a single-file extract, using badges and warnings instead of dropping graph elements.
- [ ] 5.17 Validate composition connectors, including assembly/delegation endpoint existence, compatible port direction, compatible interface type, and degraded handling for intentionally unconnected or external ports.
- [ ] 5.18 Validate SWC internal behavior relationships, including runnable references from events, runnable access points, calibration variables, inter-runnable variables, and per-instance memory links where currently parsed.
- [ ] 5.19 Validate component family constraints already represented in the app, including parameter SWC usage, service/service-proxy distinctions, sensor-actuator, ECU abstraction, complex driver, and nv-block expectations.
- [ ] 5.20 Keep semantic validation incremental so editing one ARXML file revalidates affected references without forcing a full workspace rebuild when avoidable.
- [ ] 5.21 Expose semantic validation issues in shared contracts with stable issue codes, severity, source file, XML path, semantic path, related target path, reference status, validation scope, AUTOSAR version, and optional quick-jump metadata.
- [ ] 5.22 Add fixtures and tests for version-aware extraction, standalone SWC extracts, external interface references, unresolved workspace references, wrong destination types, incompatible port/interface pairs, invalid connector endpoints, duplicate semantic paths, and incomplete but still viewable AUTOSAR models.

### Step 6 - Richer SWC and composition visualization
References:
- [AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf](https://www.autosar.org/fileadmin/standards/R23-11/CP/AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf)
- Sections: `3.3 Composition`, `3.3.2 SwComponentPrototype`, `3.3.3 Connectors`, `3.4 Port Interface`, `4.2.2 Sender Receiver Communication`, `4.2.3 Client Server Communication`, `4.2.4 External Trigger Event Communication`, `4.2.5 Communication of Modes`, `4.2.6 Parameter Communication`
- Constraints: `constr_1032`, `constr_1036`, `constr_1069` to `constr_1084`
- [x] 6.1 Update the `Model` explorer tree to group components by SWC family.
- [x] 6.2 Replace the bottom SWC inspector panel with a tabbed model workspace in the main canvas area.
  - [x] Keep `File` mode explorer unchanged for physical workspace browsing.
  - [x] Turn `Model` mode explorer into a semantic AUTOSAR browser with tree nodes for SWCs, compositions, and later ECU/system entities.
  - [x] Under each SWC, expose explorer children such as `Graph`, `Ports`, `Runnables`, `Events`, `Parameters`, `Inter-Runnable Variables`, `Per-Instance Memory`, `Exclusive Areas`, and `Service Dependencies`.
  - [x] Open semantic detail tabs from the model explorer, using titles like `Graph: CoverageApplicationSwc`, `Runnable: EvaluateCoveragePaths`, and `Port: WakeupDataPr`.
  - [x] Keep the graph tab as the default entry point for an SWC workspace.
- [x] 6.3 Add dedicated canvas tabs for SWC details instead of inspector sections, starting with interface details and Chapter 7 internal-behavior details.
  - [x] Add `Graph`, `Runnables`, `Events`, `Behavior`, and `Memory` workspace tabs for an SWC.
  - [x] Support entity-specific tabs opened from explorer or graph selections, such as `Runnable`, `Port`, and `Event`.
  - [x] Make runnable tabs the primary surface for Chapter `7.2 RunnableEntity` details.
- [x] 6.4 Keep composition layout to one SWC per row for the standards coverage fixture, including delegated composition ports.
- [x] 6.5 Preserve composition-instance selection so clicking an individual SWC under a composition opens the focused component graph with its connections.
- [x] 6.6 Render composition outer ports on the composition boundary instead of as standalone SWC-like cards.
- [x] 6.7 Add family-specific icons or glyphs for service, sensor-actuator, ECU abstraction, complex driver, nv-block, and parameter components.
- [x] 6.8 Add tests for mixed compositions containing application, parameter, service, sensor-actuator, and nv-block components.
- [ ] 6.9 Add renderer tests for model-explorer navigation and semantic workspace tab opening from AUTOSAR tree nodes.
  - [x] Implement semantic model explorer nodes and tab-opening behavior for AUTOSAR tree nodes.
  - [ ] Add formal renderer automation around model explorer tab opening.
- [ ] 6.10 Render SWC, composition, port, interface, and connector views only from the semantic model/index contracts, not directly from raw XML parser objects or XSD-generated classes.
- [ ] 6.11 Keep raw XML nodes available only as source pointers for jump-to-XML, editing, diagnostics, and traceability.
- [ ] 6.12 Add graph/view tests that prove version-specific extractor output produces the same stable semantic rendering contract for equivalent SWC and composition examples.

### Step 7 - ECU Abstraction and Complex Driver support
References:
- [AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf](https://www.autosar.org/fileadmin/standards/R23-11/CP/AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf)
- Chapter: `10 ECU Abstraction and Complex Drivers`
- Sections: `10.3.1 ECU Abstraction and its AUTOSAR Interfaces`, `10.4 Sensors/Actuators`, `10.5 I/O Hardware Abstraction`, `10.6 Complex Driver`
- Tables: `Table 10.1 SensorActuatorSwComponentType`, `Table 10.2 EcuAbstractionSwComponentType`, `Table 10.3 ComplexDeviceDriverSwComponentType`
- [x] 7.1 Parse `ECU-ABSTRACTION-SW-COMPONENT-TYPE` as a dedicated SWC family.
- [x] 7.2 Parse `COMPLEX-DEVICE-DRIVER-SW-COMPONENT-TYPE` as a dedicated SWC family.
- [ ] 7.3 Extract and expose `hardwareElement` references for ECU abstraction and complex driver components.
- [ ] 7.4 Extract and expose `SwcBswMapping` references where present.
- [ ] 7.5 Show ECU abstraction and complex driver components as ECU-local or hardware-bound elements in the UI.
- [ ] 7.6 Add inspector sections for hardware references and BSW mapping relationships.
- [ ] 7.7 Add warnings when ECU abstraction or complex driver elements are missing expected hardware references.
- [ ] 7.8 Add ARXML tests for ECU abstraction and complex driver examples, including hardware reference extraction.

### Step 8 - System Template foundation
References:
- [AUTOSAR_CP_TPS_SystemTemplate.pdf](https://www.autosar.org/fileadmin/standards/R25-11/CP/AUTOSAR_CP_TPS_SystemTemplate.pdf)
- Sections: `4 Root software composition of a system`, `5 Mapping`, `5.1 Software Component Mapping`, `3.4 Mapping of Topology Entities onto Hardware Elements`
- Tables: `Table 4.1 RootSwCompositionPrototype`, `Table 5.1 SystemMapping`, `Table 5.2 SwcToEcuMapping`, `Table 3.140 ECUMapping`
- [ ] 8.1 Extend the backend index to parse `System` documents from the System Template.
- [ ] 8.2 Parse `RootSwCompositionPrototype` and treat it as the system entry point.
- [ ] 8.3 Parse `SystemMapping`.
- [ ] 8.4 Parse `SwcToEcuMapping`.
- [ ] 8.5 Parse `EcuInstance`.
- [ ] 8.6 Parse `ECUMapping` and preserve links between topology entities and ECU-resource entities where available.
- [ ] 8.7 Parse the system and data mapping entities needed to later derive inter-ECU communication edges.
- [ ] 8.8 Add shared contracts for system-level entities and mapping relationships.
- [ ] 8.9 Add tests for root composition resolution and SWC-to-ECU mapping extraction.

### Step 9 - ECU-level visualization
References:
- [AUTOSAR_CP_TPS_SystemTemplate.pdf](https://www.autosar.org/fileadmin/standards/R25-11/CP/AUTOSAR_CP_TPS_SystemTemplate.pdf)
- Sections: `5.1 SW Component to ECU Mapping`, `3.4.1 ECU Mapping`
- [AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf](https://www.autosar.org/fileadmin/standards/R23-11/CP/AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf)
- Sections: `10.5 I/O Hardware Abstraction`, `10.6 Complex Driver`
- [ ] 9.1 Add a new graph scope: `ecu`.
- [ ] 9.2 Render each `EcuInstance` as a container for mapped SWCs.
- [ ] 9.3 Place ECU abstraction, complex driver, service, and application components inside the mapped ECU context.
- [ ] 9.4 Support recursive mapping behavior from mapped compositions down to contained atomic components.
- [ ] 9.5 Handle exceptions such as multi-ECU mapping of `ParameterSwComponentType` and `ServiceProxySwComponentType`.
- [ ] 9.6 Add drill-down navigation from ECU view into composition view and SWC detail view.
- [ ] 9.7 Add tests for single-ECU and multi-ECU mapping scenarios.

### Step 10 - Whole-system visualization
References:
- [AUTOSAR_CP_TPS_SystemTemplate.pdf](https://www.autosar.org/fileadmin/standards/R25-11/CP/AUTOSAR_CP_TPS_SystemTemplate.pdf)
- Sections: `4 Root software composition of a system`, `5 Mapping`, `5.1 Software Component Mapping`, `5.2` data and signal mapping related sections
- Tables: `Table 4.1 RootSwCompositionPrototype`, `Table 5.1 SystemMapping`, `Table 5.2 SwcToEcuMapping`
- [ ] 10.1 Add a new graph scope: `system`.
- [ ] 10.2 Build the top-level graph from `RootSwCompositionPrototype`.
- [ ] 10.3 Render multiple `EcuInstance` containers in the same system canvas.
- [ ] 10.4 Show which SWCs are deployed on which ECU using `SwcToEcuMapping`.
- [ ] 10.5 Derive inter-ECU edges from system and data mapping information, not only composition-level connectors.
- [ ] 10.6 Distinguish intra-ECU and inter-ECU connections visually.
- [ ] 10.7 Support navigation chain: `System -> ECU -> Composition -> SWC -> Port/Behavior -> XML`.
- [ ] 10.8 Add degraded-state handling for incomplete system descriptions and partial extracts.
- [ ] 10.9 Add end-to-end tests for a small multi-ECU AUTOSAR system sample.

### Step 11 - Quality and usability hardening
References:
- Cross-cutting step covering the compatibility and mapping constraints in [AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf](https://www.autosar.org/fileadmin/standards/R23-11/CP/AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf) and [AUTOSAR_CP_TPS_SystemTemplate.pdf](https://www.autosar.org/fileadmin/standards/R25-11/CP/AUTOSAR_CP_TPS_SystemTemplate.pdf)
- [ ] 11.1 Keep all new parsing, validation, and graph building off the renderer thread.
- [ ] 11.2 Add incremental indexing paths so larger multi-ECU workspaces remain responsive.
- [ ] 11.3 Improve warning messages with exact ARXML path and entity context.
- [ ] 11.4 Add sample-workspace fixtures that cover SWC-only, composition, ECU, and whole-system scenarios.
- [x] 11.4.a Expand `examples/example-ecu-project.arxml` with validation coverage for AUTOSAR SWC families, `P/R/PR` ports, composition wiring, ECU abstraction, and complex driver examples.
- [ ] 11.4.b Add a dedicated multi-ECU whole-system sample focused on `EcuInstance`, deployment mapping, and inter-ECU communication.
- [x] 11.4.c Add Playwright-based Electron validation that opens the standards coverage fixture and verifies model rendering end-to-end.
- [ ] 11.4.d Add Playwright-based Electron validation flows that open the example AUTOSAR workspace and verify model rendering, inspectors, navigation, and AUTOSAR-specific node and port coverage.
- [ ] 11.5 Review `README.md` so supported AUTOSAR element coverage is documented clearly.
- [ ] 11.6 Keep `PLAN.md` as the source of truth and update completed boxes after each implementation task.

## Important Interfaces and Public Surface
- `WorkspaceService`: open folder, watch files, maintain workspace snapshot, rebuild on external change.
- `ArxmlDocumentService`: open and save one ARXML document, run validation in single-file or workspace context, and return structured editor data.
- `ArxmlValidationService`: validate XML well-formedness, AUTOSAR namespace/schema metadata, XSD conformance, serialization rules, validation scope, completeness, and normalized issue reporting.
- `AutosarVersionAdapterRegistry`: select the correct semantic extractor behavior from detected AUTOSAR namespace, schema filename, or user-selected version.
- `AutosarSemanticExtractor`: convert generic XML AST nodes into stable app-level AUTOSAR entities for SWCs, ports, interfaces, compositions, connectors, behavior, mapping, and hardware features.
- `AutosarModelIndex`: expose entities, references, and connections from one file or many files for semantic validation, model mode, ECU view, and later system view.
- `AutosarReferenceResolver`: classify references as local, workspace-resolved, external, unresolved, or wrong-kind based on available ARXML context.
- `AutosarSemanticValidationService`: resolve references and validate currently supported AUTOSAR model constraints without blocking partial single-file or workspace exploration.
- `GraphService`: produce `swc`, `composition`, `ecu`, and later `system` graph data from the indexed AUTOSAR model while preserving partial/external nodes and references.
- Shared contracts should evolve to carry validation issue categories, issue codes, validation scope, completeness, reference status, source/target paths, `swcKind`, `portKind`, `portInterfaceKind`, ECU mapping metadata, hardware references, and inter-ECU linkage.
- Renderer UI contract includes an `Explorer tree` for workspace files.
- Renderer UI contract includes a `Tabbed editor` for multi-file editing.
- Renderer UI contract includes an `Editor mode toggle` for raw vs structured editing.
- Renderer UI contract includes `Graph actions` for SWC, composition, ECU, and whole-system visualization.

## Test Plan
- [ ] Validate malformed XML, namespace/schema detection, XSD validation failures, and AUTOSAR serialization-rule diagnostics.
- [ ] Validate version-aware semantic extractors with equivalent SWC/composition fixtures from supported AUTOSAR versions.
- [ ] Validate single-file SWC extracts with external interface references and confirm the model view remains useful with incomplete-context warnings.
- [ ] Validate workspace reference resolution, wrong destination detection, duplicate semantic paths, unresolved reference reporting, and stricter workspace diagnostics.
- [ ] Validate that graph/model views consume semantic contracts and do not depend on raw XML parser object shapes.
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
- [x] Run `npm run typecheck`.
- [x] Run `npm test`.
- [x] Prefer `npm run verify:functional` after each functional milestone.

## Assumptions and Defaults
- Desktop Electron app remains the active target.
- Target scope remains AUTOSAR Classic Platform.
- Roadmap priority is `ARXML viewer/editor first`, then `standards-aware visualization`, then `ECU/system-level topology`.
- Primary users are engineers working with local AUTOSAR workspaces.
- Windows remains the main target for now, with later portability kept in mind.
- System visualization should be built on the same shared semantic index as current SWC and composition views.
- Incomplete AUTOSAR models should remain viewable with warnings rather than hard failures.
- Checkboxes are intended to live in `PLAN.md` as a working execution tracker.
