# AUTOSAR Model View VS Code Extension Migration Plan

This project migrates only the AUTOSAR model-view functionality from
main branch into a focused VS Code extension. ARXML viewer,
editor, schema validation UI, raw/structured editing, file tabs, save flows,
and Electron shell code are intentionally out of scope.

## 1. Scaffold The Extension

- [x] Create a TypeScript VS Code extension project in this folder.
- [x] Add `package.json`, `tsconfig.json`, `.vscodeignore`, and source folders.
- [x] Register commands:
  - [x] `autosarModelView.open`
  - [x] `autosarModelView.openFile`
  - [x] `autosarModelView.refresh`
- [x] Register a dedicated AUTOSAR model tree view.
- [x] Add build/typecheck scripts.

## 2. Move Shared Model Contracts

- [x] Copy model-related contracts from `src/shared/contracts.ts`.
- [x] Keep only data needed for model indexing, model tree, graph rendering, and
  webview communication.
- [x] Avoid editor/search/save-only APIs from the Electron app.

## 3. Move Model Extraction Services

- [x] Copy and adapt:
  - [x] `autosarModel.ts`
  - [x] `autosarVersionAdapters.ts`
  - [x] `autosarSemanticValidationService.ts`
  - [x] `vectorProjectService.ts`
  - [x] `graphService.ts`
- [x] Replace Electron-relative imports with extension-local imports.
- [x] Keep `fast-xml-parser` as the model parser.
- [x] Do not port XSD validation or ARXML editor services.
- [x] Copy AUTOSAR schema resources to `resources/autosar-schemas/`.
- [x] Copy source example ARXML files to `examples/`.

## 5. Source Step 5 - AUTOSAR Reference And Semantic Validation

- [x] Build one AUTOSAR model index path for either a single ARXML file or a full workspace.
  - [x] Detect Vector DaVinci metadata such as `.dpa`, `.dcf`, `.dvgproj`, `.dvgproject`, and `.dvcfg`.
  - [x] Seed workspace semantic indexing from Vector metadata-referenced ARXML inputs.
  - [x] Fall back to all ARXML files when Vector metadata inputs cannot be resolved.
- [x] Add version-aware semantic extractor interfaces.
- [x] Implement the shared Classic AUTOSAR extractor foundation.
- [ ] Add focused extractors for every source-app roadmap entity:
  - [x] SWCs
  - [x] ports
  - [x] interfaces
  - [x] compositions
  - [x] component prototypes
  - [x] connectors
  - [x] runnables
  - [x] events
  - [x] memory
  - [x] calibration data
  - [ ] ECU mappings
  - [ ] hardware references
- [x] Keep extractor output stable across AUTOSAR versions through shared semantic contracts.
- [x] Record semantic paths, XML paths, entity kinds, `SHORT-NAME` chains, defining file, owning package, validation scope, model completeness, AUTOSAR version, and raw source pointers where available.
- [x] Build the model index first, then resolve references in a separate semantic validation pass.
- [x] Resolve `*-REF` and `*-TREF` values against single-file or workspace context.
- [x] Classify references as resolved, external, unresolved, wrong-kind, or ambiguous through shared contracts.
- [x] Treat missing outside entities in single-file mode as incomplete/external context rather than fatal.
- [x] Escalate missing cross-file references in workspace mode where targets should be loaded.
- [ ] Complete destination-kind validation coverage:
  - [x] port interfaces
  - [x] component types
  - [x] component prototypes
  - [x] connector ports
  - [ ] runnable/event references
  - [ ] mapping/hardware references
- [x] Report reference diagnostics with source XML path, reference value, expected destination, status, scope, and related target data.
- [x] Detect duplicate or ambiguous semantic paths.
- [ ] Validate port/interface compatibility for `P`, `R`, and `PR` ports.
- [x] Preserve port and connector display when definitions/endpoints are external or incomplete.
- [ ] Complete composition connector validation:
  - [x] endpoint existence
  - [ ] port-direction compatibility
  - [ ] interface compatibility
- [ ] Validate SWC internal behavior relationships:
  - [x] extract runnable access-point details
  - [ ] validate runnable access-point references
- [ ] Validate component-family constraints for parameter, service, service-proxy, sensor-actuator, ECU abstraction, complex driver, and nv-block expectations.
- [ ] Add incremental semantic validation so editing or refreshing one ARXML avoids a full rebuild when possible.
- [x] Expose semantic validation issues in shared contracts.
- [ ] Add fixtures and tests for version-aware extraction, external references, unresolved workspace references, wrong destinations, invalid connectors, duplicates, and incomplete viewable models.

## 6. Source Step 6 - Richer SWC And Composition Visualization

- [x] Update the model explorer tree to group components by SWC family.
  - [ ] Native VS Code TreeView cannot persist custom row backgrounds/borders; consider custom tree webview if exact row styling is required.
  - [x] Default-open Software Compositions and Software Components while keeping SWC family groups folded.
- [x] Replace the source app bottom inspector model with a tabbed model workspace webview.
  - [x] Keep file/explorer editing features out of this extension.
  - [x] Turn the VS Code AUTOSAR tree into a semantic AUTOSAR browser.
  - [x] Under each SWC, expose `Graph`, `Ports`, `Runnables`, `Inter-Runnable Variables`, `Calibration Parameters`, `Per-Instance Memory`, and `Service Needs`.
  - [x] Open semantic detail tabs from tree selections.
  - [x] Keep the graph tab as the default entry point.
- [x] Port dedicated canvas/detail tabs for SWC details.
  - [x] `Graph`
  - [x] `Runnables`
  - [x] `Ports`
  - [x] `Runnable`
  - [x] `Port`
  - [x] behavior/memory/parameter/service detail tables supported by the ported `ModelPanel`.
- [x] Port runnable detail tables, trigger events, access points, activation reasons, and sortable/searchable surfaces from the source model UI.
- [x] Port richer port detail surface, including direction, API options, argument values, communication specs, service-port metadata, interface-aware labels, and interface member fallback details.
- [x] Port clickable Ports and Runnables tables that open detail tabs.
- [x] Render selected software composition as a focused graph node with composition ports.
- [x] Preserve composition-instance selection and graph navigation inside model mode.
- [x] Render composition outer ports on the composition boundary.
- [x] Add family-specific glyphs/icons for service, sensor-actuator, ECU abstraction, complex driver, nv-block, and parameter components.

## 7. Source Step 7 - ECU Abstraction And Complex Driver Support
References:
- [AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf](https://www.autosar.org/fileadmin/standards/R23-11/CP/AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf)
- Chapter: `10 ECU Abstraction and Complex Drivers`
- Sections: `10.3.1 ECU Abstraction and its AUTOSAR Interfaces`, `10.4 Sensors/Actuators`, `10.5 I/O Hardware Abstraction`, `10.6 Complex Driver`
- Tables: `Table 10.1 SensorActuatorSwComponentType`, `Table 10.2 EcuAbstractionSwComponentType`, `Table 10.3 ComplexDeviceDriverSwComponentType`
- [x] Parse `ECU-ABSTRACTION-SW-COMPONENT-TYPE` as a dedicated SWC family.
- [x] Parse `COMPLEX-DEVICE-DRIVER-SW-COMPONENT-TYPE` as a dedicated SWC family.
- [ ] Extract and expose `hardwareElement` references for ECU abstraction and complex driver components.
- [ ] Extract and expose `SwcBswMapping` references where present.
- [ ] Show ECU abstraction and complex driver components as ECU-local or hardware-bound elements in the UI.
- [ ] Add detail sections for hardware references and BSW mapping relationships.
- [ ] Add warnings when expected hardware references are missing.
- [ ] Add ARXML tests for ECU abstraction and complex driver examples, including hardware reference extraction.

## 8. Source Step 8 - System Template Foundation
References:
- [AUTOSAR_CP_TPS_SystemTemplate.pdf](https://www.autosar.org/fileadmin/standards/R25-11/CP/AUTOSAR_CP_TPS_SystemTemplate.pdf)
- Sections: `4 Root software composition of a system`, `5 Mapping`, `5.1 Software Component Mapping`, `3.4 Mapping of Topology Entities onto Hardware Elements`
- Tables: `Table 4.1 RootSwCompositionPrototype`, `Table 5.1 SystemMapping`, `Table 5.2 SwcToEcuMapping`, `Table 3.140 ECUMapping`
- [ ] Extend the extension host index to parse `System` documents from the System Template.
- [ ] Parse `RootSwCompositionPrototype` and treat it as the system entry point.
- [ ] Parse `SystemMapping`.
- [ ] Parse `SwcToEcuMapping`.
- [ ] Parse `EcuInstance`.
- [ ] Parse `ECUMapping` and preserve links between topology entities and ECU-resource entities.
- [ ] Parse system and data mapping entities needed to derive inter-ECU communication edges.
- [ ] Add shared contracts for system-level entities and mapping relationships.
- [ ] Add tests for root composition resolution and SWC-to-ECU mapping extraction.

## 9. Source Step 9 - ECU-Level Visualization
References:
- [AUTOSAR_CP_TPS_SystemTemplate.pdf](https://www.autosar.org/fileadmin/standards/R25-11/CP/AUTOSAR_CP_TPS_SystemTemplate.pdf)
- Sections: `5.1 SW Component to ECU Mapping`, `3.4.1 ECU Mapping`
- [AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf](https://www.autosar.org/fileadmin/standards/R23-11/CP/AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf)
- Sections: `10.5 I/O Hardware Abstraction`, `10.6 Complex Driver`
- [ ] Add a new graph scope: `ecu`.
- [ ] Render each `EcuInstance` as a container for mapped SWCs.
- [ ] Place ECU abstraction, complex driver, service, and application components inside the mapped ECU context.
- [ ] Support recursive mapping behavior from mapped compositions down to contained atomic components.
- [ ] Handle multi-ECU mapping exceptions such as `ParameterSwComponentType` and `ServiceProxySwComponentType`.
- [ ] Add drill-down navigation from ECU view into composition view and SWC detail view.
- [ ] Add tests for single-ECU and multi-ECU mapping scenarios.

## 10. Source Step 10 - Whole-System Visualization
References:
- [AUTOSAR_CP_TPS_SystemTemplate.pdf](https://www.autosar.org/fileadmin/standards/R25-11/CP/AUTOSAR_CP_TPS_SystemTemplate.pdf)
- Sections: `4 Root software composition of a system`, `5 Mapping`, `5.1 Software Component Mapping`, `5.2` data and signal mapping related sections
- Tables: `Table 4.1 RootSwCompositionPrototype`, `Table 5.1 SystemMapping`, `Table 5.2 SwcToEcuMapping`
- [ ] Add a new graph scope: `system`.
- [ ] Build the top-level graph from `RootSwCompositionPrototype`.
- [ ] Render multiple `EcuInstance` containers in the same system canvas.
- [ ] Show which SWCs are deployed on which ECU using `SwcToEcuMapping`.
- [ ] Derive inter-ECU edges from system and data mapping information, not only composition-level connectors.
- [ ] Distinguish intra-ECU and inter-ECU connections visually.
- [ ] Support navigation chain: `System -> ECU -> Composition -> SWC -> Port/Behavior -> XML`.
- [ ] Add degraded-state handling for incomplete system descriptions and partial extracts.
- [ ] Add end-to-end tests for a small multi-ECU AUTOSAR system sample.

## 11. Source Step 11 - ARXML Syntax, Schema, And Serialization Validation

The extension is model-view focused, so source-app ARXML editor validation UI is
not part of the first migration. Keep these items as parity/backlog work only
where diagnostics improve model exploration.

- [ ] Add an explicit ARXML validation service in the extension host, separate from model extraction.
- [ ] Report XML well-formedness errors before semantic parsing with message, file path, line, column when available, and stable issue code.
- [ ] Detect AUTOSAR namespace, declared schema location, and release/version hints from the root `AUTOSAR` element.
- [ ] Warn when the root namespace is missing, non-AUTOSAR, or unsupported for the selected validation mode.
- [ ] Add a schema registry abstraction that maps detected or user-selected AUTOSAR releases to local XSD files.
  - [ ] Decide whether the extension should bundle or optionally locate `resources/autosar-schemas/`.
- [ ] Validate ARXML against selected AUTOSAR XSD and surface structural schema errors.
- [x] Preserve validation scopes for `single-file` and `workspace` in shared contracts.
- [ ] Support workspace-level validation of split AUTOSAR projects while preserving per-file results.
- [ ] Add serialization-rule checks for namespace usage, schema location shape, extra namespaces, and root/schema consistency.
- [x] Keep validation issue contracts for `syntax`, `namespace`, `schema`, `serialization`, and `semantic`.
- [x] Carry validation scope and completeness metadata in document/workspace results.
- [ ] Show syntax/schema/serialization diagnostics in VS Code Problems or a model diagnostics view.
- [ ] Add fixtures for malformed XML, namespace/schema edge cases, schema-invalid ARXML, and standalone schema-valid SWC extracts.
- [ ] Add unit tests for validation issue normalization and UI/extension diagnostics.

## References:
- [AUTOSAR_CP_TPS_SystemTemplate.pdf](https://www.autosar.org/fileadmin/standards/R25-11/CP/AUTOSAR_CP_TPS_SystemTemplate.pdf)
- [AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf](https://www.autosar.org/fileadmin/standards/R23-11/CP/AUTOSAR_CP_TPS_SoftwareComponentTemplate.pdf)
- [AUTOSAR_FO_TPS_ARXMLSerializationRules.pdf](https://www.autosar.org/fileadmin/standards/R25-11/FO/AUTOSAR_FO_TPS_ARXMLSerializationRules.pdf)
- [AUTOSAR_FO_TPS_XMLSchemaProductionRules.pdf](https://www.autosar.org/fileadmin/standards/R23-11/FO/AUTOSAR_FO_TPS_XMLSchemaProductionRules.pdf)


