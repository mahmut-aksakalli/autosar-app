import type {
  InterRunnableVariableAccessDetail,
  ServiceAssignedDataDetail,
  ServiceAssignedPortDetail,
  ServiceNeedField,
  SwcInspectorItem
} from "../../../../src/shared/contracts";
import {
  formatInterRunnableCommunicationOption,
  formatInitValueTypeOption,
  formatMeasurementCalibrationOption,
  formatNumber,
  formatParameterScopeOption,
  formatReferenceShortName,
  formatTimeInterval,
  initValueTypeOptions,
  ModelInitValueDisplay,
  normalizeAutosarEnumToken
} from "./InspectorShared";

export function ModelParameterDetails(props: { title: string; parameter?: SwcInspectorItem }) {
  const { title, parameter } = props;
  const metadata = parameter?.metadata ?? {};
  const scope = formatParameterScopeOption(metadata.SCOPE);
  const measurementCalibration = formatMeasurementCalibrationOption(metadata["SW-CALIBRATION-ACCESS"] ?? "-");

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
      </div>
      <div className="model-port-detail">
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Parameter Name</span>
            <strong>{parameter?.label ?? "-"}</strong>
          </div>
          <div>
            <span>Type</span>
            <strong>{formatReferenceShortName(metadata.TYPE)}</strong>
          </div>
          <div>
            <span>Init Value</span>
            <strong className="model-inline-value-with-select">
              <select value={formatInitValueTypeOption(metadata["INITIAL-VALUE-TYPE"] ?? "-")} disabled>
                {initValueTypeOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
              <ModelInitValueDisplay
                value={metadata["INITIAL-VALUE"] ?? "-"}
                type={metadata["INITIAL-VALUE-TYPE"] ?? "-"}
              />
            </strong>
          </div>
          <div>
            <span>Addressing Method</span>
            <strong>{formatReferenceShortName(metadata["SW-ADDR-METHOD-REF"])}</strong>
          </div>
          <div>
            <span>Scope</span>
            <strong>
              <select value={scope} disabled>
                <option>-</option>
                <option>Shared</option>
                <option>Per Instance</option>
              </select>
            </strong>
          </div>
          <div>
            <span>Measurement&amp;Calibration</span>
            <strong>
              <select value={measurementCalibration} disabled>
                <option>Not Accessible</option>
                <option>Read</option>
                <option>Write</option>
                <option>ReadWrite</option>
              </select>
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ModelInterRunnableVariableDetails(props: { title: string; variable?: SwcInspectorItem }) {
  const { title, variable } = props;
  const metadata = variable?.metadata ?? {};
  const accessRows = variable?.details?.interRunnableVariableAccesses ?? [];

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
      </div>
      <div className="model-port-detail">
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Name</span>
            <strong>{variable?.label ?? "-"}</strong>
          </div>
          <div>
            <span>Data Type</span>
            <strong>{formatReferenceShortName(metadata.TYPE)}</strong>
          </div>
          <div>
            <span>Init Value</span>
            <strong className="model-inline-value-with-select">
              <select value={formatInitValueTypeOption(metadata["INITIAL-VALUE-TYPE"] ?? "-")} disabled>
                {initValueTypeOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
              <ModelInitValueDisplay
                value={metadata["INITIAL-VALUE"] ?? "-"}
                type={metadata["INITIAL-VALUE-TYPE"] ?? "-"}
              />
            </strong>
          </div>
          <div>
            <span>Communication</span>
            <strong>
              <select value={formatInterRunnableCommunicationOption(metadata.COMMUNICATION)} disabled>
                <option>-</option>
                <option>Explicit</option>
                <option>Implicit</option>
              </select>
            </strong>
          </div>
          <div>
            <span>Measurement&amp;Calibration</span>
            <strong>
              <select value={formatMeasurementCalibrationOption(metadata["SW-CALIBRATION-ACCESS"] ?? "-")} disabled>
                <option>Not Accessible</option>
                <option>Read</option>
                <option>Write</option>
                <option>ReadWrite</option>
              </select>
            </strong>
          </div>
          <div>
            <span>Addressing Method</span>
            <strong>{formatReferenceShortName(metadata["SW-ADDR-METHOD-REF"])}</strong>
          </div>
        </div>
        <ModelInterRunnableVariableAccessTable rows={accessRows} />
      </div>
    </div>
  );
}

export function ModelPerInstanceMemoryDetails(props: { title: string; item?: SwcInspectorItem }) {
  const { title, item } = props;
  const metadata = item?.metadata ?? {};

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
      </div>
      <div className="model-port-detail">
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Name</span>
            <strong>{item?.label ?? "-"}</strong>
          </div>
          <div>
            <span>Data Type</span>
            <strong>{formatReferenceShortName(metadata.TYPE)}</strong>
          </div>
          <div>
            <span>Init Value</span>
            <strong className="model-inline-value-with-select">
              <select value={formatInitValueTypeOption(metadata["INITIAL-VALUE-TYPE"] ?? "-")} disabled>
                {initValueTypeOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
              <ModelInitValueDisplay
                value={metadata["INITIAL-VALUE"] ?? "-"}
                type={metadata["INITIAL-VALUE-TYPE"] ?? "-"}
              />
            </strong>
          </div>
          <div>
            <span>Nvm Block Need</span>
            <strong>{formatReferenceShortName(metadata["NVM-BLOCK-NEED"])}</strong>
          </div>
          <div>
            <span>Measurement&amp;Calibration</span>
            <strong>
              <select value={formatMeasurementCalibrationOption(metadata["SW-CALIBRATION-ACCESS"] ?? "-")} disabled>
                <option>Not Accessible</option>
                <option>Read</option>
                <option>Write</option>
                <option>ReadWrite</option>
              </select>
            </strong>
          </div>
          <div>
            <span>Addressing Method</span>
            <strong>{formatReferenceShortName(metadata["SW-ADDR-METHOD-REF"])}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ModelServiceDependencyDetails(props: { title: string; item?: SwcInspectorItem }) {
  const { title, item } = props;
  const metadata = item?.metadata ?? {};
  const serviceNeedDetails = parseServiceNeedDetailFields(
    item?.details?.serviceNeedFields ?? [],
    metadata["SERVICE-NEED-DETAILS"]
  );
  const serviceType = normalizeAutosarEnumToken(metadata["SERVICE-TYPE"] ?? "");
  const isNvBlockNeeds = serviceType === "nvblockneeds";
  const isDiagnosticEnableConditionNeeds = serviceType === "diagnosticenableconditionneeds";
  const detailRows = getServiceNeedDetailRows(
    item?.label,
    metadata,
    serviceNeedDetails,
    item?.details?.assignedPorts ?? []
  );
  const assignedData = isNvBlockNeeds
    ? parseNvmAssignedDataDetails(metadata, item?.details?.assignedData ?? [])
    : [];
  const dataAssignments = isDiagnosticEnableConditionNeeds
    ? item?.details?.assignedData ?? []
    : [];
  const assignedPorts = item?.details?.assignedPorts ?? [];

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
      </div>
      <div className="model-port-detail">
        <div className="model-semantic-kv model-port-fields">
          {detailRows.map((detail) => (
            <ModelServiceNeedDetailRow key={detail.label} detail={detail} />
          ))}
        </div>
        {isNvBlockNeeds ? <ModelNvmAssignedDataTable rows={assignedData} /> : null}
        {isDiagnosticEnableConditionNeeds ? <ModelServiceDataAssignmentsTable rows={dataAssignments} /> : null}
        <ModelServiceAssignedPortsTable
          rows={assignedPorts}
          title={isDiagnosticEnableConditionNeeds ? "Port Assignments" : "Assigned Ports"}
        />
      </div>
    </div>
  );
}

function ModelServiceNeedDetailRow(props: { detail: ServiceNeedDisplayDetail }) {
  const { detail } = props;
  return (
    <div>
      <span>{detail.label}</span>
      <strong>
        {detail.kind === "checkbox" ? (
          <input type="checkbox" checked={detail.checked === true} disabled readOnly />
        ) : detail.kind === "checkboxDropdown" ? (
          <span className="model-inline-value-with-select">
            <input type="checkbox" checked={detail.checked === true} disabled readOnly />
            <select value={detail.value || "-"} disabled>
              {getServiceNeedSelectOptions(detail.value || "-", detail.options).map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </span>
        ) : detail.kind === "dropdown" ? (
          <select value={detail.value || "-"} disabled>
            <option>{detail.value || "-"}</option>
          </select>
        ) : detail.value}
      </strong>
    </div>
  );
}

function ModelNvmAssignedDataTable(props: { rows: NvmAssignedDataDetail[] }) {
  const { rows } = props;
  return (
    <section className="model-port-argument-section">
      <h3>NVM Assigned Data</h3>
      <div className="model-runnable-table-scroll">
        <table className="model-runnable-table">
          <thead>
            <tr>
              <th>Assigned Role</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.role}>
                <td title={row.role}>{row.role}</td>
                <td title={row.value}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ModelServiceDataAssignmentsTable(props: { rows: ServiceAssignedDataDetail[] }) {
  const { rows } = props;
  return (
    <section className="model-port-argument-section">
      <h3>Data Assignments</h3>
      {rows.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table className="model-runnable-table">
            <thead>
              <tr>
                <th>Port Prototype</th>
                <th>Port Interface</th>
                <th>Data Element Prototype</th>
                <th>Assigned Role</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.portPrototype}:${row.dataElementPrototype}:${row.assignedRole}:${index}`}>
                  <td title={row.portPrototypeRef ?? row.portPrototype}>{row.portPrototype}</td>
                  <td title={row.portInterfaceRef ?? row.portInterface}>{row.portInterface}</td>
                  <td title={row.dataElementPrototypeRef ?? row.dataElementPrototype}>{row.dataElementPrototype}</td>
                  <td title={row.assignedRole}>{row.assignedRole}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="model-list-empty">No data assignments discovered.</div>
      )}
    </section>
  );
}

function ModelServiceAssignedPortsTable(props: { rows: ServiceAssignedPortDetail[]; title?: string }) {
  const { rows, title = "Assigned Ports" } = props;
  return (
    <section className="model-port-argument-section">
      <h3>{title}</h3>
      {rows.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table className="model-runnable-table">
            <thead>
              <tr>
                <th>Port Prototype</th>
                <th>Port Interface</th>
                <th>Assigned Role</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.portPrototype}:${row.assignedRole}:${index}`}>
                  <td title={row.portPrototypeRef ?? row.portPrototype}>{row.portPrototype}</td>
                  <td title={row.portInterfaceRef ?? row.portInterface}>{row.portInterface}</td>
                  <td title={row.assignedRole}>{row.assignedRole}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="model-list-empty">No assigned ports discovered.</div>
      )}
    </section>
  );
}

function ModelInterRunnableVariableAccessTable(props: { rows: InterRunnableVariableAccessDetail[] }) {
  const { rows } = props;
  return (
    <section className="model-port-argument-section">
      <h3>Inter-Runnable Variable Access</h3>
      {rows.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table className="model-runnable-table">
            <thead>
              <tr>
                <th>Runnable</th>
                <th>Access</th>
                <th>Access Point</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.runnable}:${row.access}:${row.accessPoint}:${index}`}>
                  <td title={row.runnable}>{row.runnable}</td>
                  <td title={row.access}>{row.access}</td>
                  <td title={row.accessPoint}>{row.accessPoint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="model-list-empty">No accessing runnables discovered.</div>
      )}
    </section>
  );
}

type ServiceNeedDetailField = {
  tag?: string;
  label: string;
  value: string;
  kind: "checkbox" | "dropdown";
  checked: boolean;
};

type ServiceNeedDisplayDetail = {
  label: string;
  value: string;
  kind: "checkbox" | "checkboxDropdown" | "dropdown" | "number" | "text";
  checked?: boolean;
  options?: string[];
};

interface NvmAssignedDataDetail {
  role: "ramBlock" | "defaultValue";
  value: string;
}

const nvBlockNeedsDetailOrder: Array<{
  label: string;
  tag?: string;
  aliases?: string[];
  kind: ServiceNeedDisplayDetail["kind"];
  defaultValue?: string;
}> = [
  { label: "Name", kind: "text" },
  { label: "Service Need", kind: "text" },
  { label: "Category", kind: "text" },
  { label: "Ram Block Status Control", tag: "RAM-BLOCK-STATUS-CONTROL", kind: "dropdown" },
  { label: "Reliability", tag: "RELIABILITY", kind: "dropdown" },
  { label: "Writing Priority", tag: "WRITING-PRIORITY", kind: "dropdown" },
  { label: "Number of Datasets", tag: "N-DATA-SETS", aliases: ["N Data Sets"], kind: "number", defaultValue: "0" },
  { label: "Number of ROM Block", tag: "N-ROM-BLOCKS", aliases: ["N Rom Blocks"], kind: "number", defaultValue: "0" },
  { label: "Calc Ram Block Crc", tag: "CALC-RAM-BLOCK-CRC", kind: "checkbox", defaultValue: "false" },
  { label: "Readonly", tag: "READONLY", kind: "checkbox", defaultValue: "false" },
  {
    label: "Resistant To Changed Sw",
    tag: "RESISTANT-TO-CHANGED-SW",
    kind: "checkbox",
    defaultValue: "false"
  },
  { label: "Restore At Start", tag: "RESTORE-AT-START", kind: "checkbox", defaultValue: "false" },
  { label: "Store At Shutdown", tag: "STORE-AT-SHUTDOWN", kind: "checkbox", defaultValue: "false" },
  { label: "Use Crc Comp Mechanism", tag: "USE-CRC-COMP-MECHANISM", kind: "checkbox", defaultValue: "false" },
  { label: "Check Static Block ID", tag: "CHECK-STATIC-BLOCK-ID", kind: "checkbox", defaultValue: "false" },
  { label: "Write Verification", tag: "WRITE-VERIFICATION", kind: "checkbox", defaultValue: "false" },
  { label: "Write only once", tag: "WRITE-ONLY-ONCE", kind: "checkbox", defaultValue: "false" },
  {
    label: "Use Auto Validation at Shutdown",
    tag: "USE-AUTO-VALIDATION-AT-SHUT-DOWN",
    aliases: ["Use Auto Validation At Shut Down"],
    kind: "checkbox",
    defaultValue: "false"
  },
  { label: "Store Emergency", tag: "STORE-EMERGENCY", kind: "checkbox", defaultValue: "false" },
  { label: "Store Immediate", tag: "STORE-IMMEDIATE", kind: "checkbox", defaultValue: "false" },
  { label: "Store Cyclic", tag: "STORE-CYCLIC", kind: "checkbox", defaultValue: "false" },
  { label: "Cyclic Writing Period", tag: "CYCLIC-WRITING-PERIOD", kind: "number", defaultValue: "0 sec" }
];

type ServiceNeedDetailDefinition = {
  label: string;
  tag?: string;
  aliases?: string[];
  kind: ServiceNeedDisplayDetail["kind"];
  defaultValue?: string;
  options?: string[];
  formatter?: (value: string) => string;
};

const serviceNeedDetailOrders: Record<string, ServiceNeedDetailDefinition[]> = {
  bswmgrneeds: [
    { label: "Name", kind: "text" },
    { label: "Service Need", kind: "text" },
    { label: "Represented Port Group", tag: "REPRESENTED-PORT-GROUP", kind: "dropdown" },
    { label: "Port Assignment", kind: "text" }
  ],
  commgruserneeds: [
    { label: "Name", kind: "text" },
    { label: "Service Need", kind: "text" },
    { label: "Max Comm Mode", tag: "MAX-COMM-MODE", kind: "dropdown" },
    { label: "Represented Port Group", tag: "REPRESENTED-PORT-GROUP", kind: "dropdown" },
    { label: "Port Assignment", kind: "text" }
  ],
  cryptoserviceneeds: [
    { label: "Name", kind: "text" },
    { label: "Service Need", kind: "text" },
    {
      label: "Max Key Length",
      tag: "MAX-KEY-LENGTH",
      kind: "number",
      defaultValue: "0 bytes",
      formatter: formatBytesValue
    },
    { label: "Port Assignment", kind: "text" }
  ],
  diagnosticcommunicationmanagerneeds: [
    { label: "Name", kind: "text" },
    { label: "Service Need", kind: "text" },
    { label: "Security Access Level", tag: "SECURITY-ACCESS-LEVEL", kind: "number", defaultValue: "0" },
    {
      label: "Service Request Callback Type",
      tag: "SERVICE-REQUEST-CALLBACK-TYPE",
      kind: "checkboxDropdown",
      options: ["Manufacturer", "Supplier"]
    },
    { label: "Port Assignment", kind: "text" }
  ],
  diagnosticenableconditionneeds: [
    { label: "Name", kind: "text" },
    { label: "Service Need", kind: "text" },
    { label: "Security Access Level", tag: "SECURITY-ACCESS-LEVEL", kind: "number", defaultValue: "0" },
    { label: "DID Number", tag: "DID-NUMBER", aliases: ["Did Number"], kind: "number", defaultValue: "0" },
    {
      label: "Processing Style",
      tag: "PROCESSING-STYLE",
      kind: "checkboxDropdown",
      options: ["Asynch", "Synch", "Asynch with Error"]
    },
    { label: "Port Assignment", kind: "text" },
    { label: "Fixed Length", tag: "FIXED-LENGTH", kind: "checkbox", defaultValue: "false" }
  ]
};

function getGenericServiceNeedDetailRows(
  itemLabel: string | undefined,
  metadata: Record<string, string>,
  details: ServiceNeedDetailField[]
): ServiceNeedDisplayDetail[] {
  const rows: ServiceNeedDisplayDetail[] = [
    { label: "Name", value: itemLabel ?? "-", kind: "text" },
    { label: "Service Need", value: metadata["SERVICE-NEED"] ?? "-", kind: "text" },
    { label: "Category", value: metadata.CATEGORY ?? "-", kind: "text" }
  ];

  if (details.length === 0) {
    return [...rows, { label: "Service Need Details", value: "-", kind: "text" }];
  }

  return [
    ...rows,
    ...details.map((detail) => ({
      label: detail.label,
      value: detail.value,
      kind: detail.kind,
      checked: detail.checked
    }))
  ];
}

function getServiceNeedDetailRows(
  itemLabel: string | undefined,
  metadata: Record<string, string>,
  details: ServiceNeedDetailField[],
  assignedPorts: ServiceAssignedPortDetail[]
): ServiceNeedDisplayDetail[] {
  const serviceType = normalizeAutosarEnumToken(metadata["SERVICE-TYPE"] ?? "");
  if (serviceType === "nvblockneeds") {
    return getNvBlockNeedsDetailRows(itemLabel, metadata, details);
  }

  const definitions = serviceNeedDetailOrders[serviceType];
  if (!definitions) {
    return getGenericServiceNeedDetailRows(itemLabel, metadata, details);
  }

  return definitions.map((definition) =>
    buildServiceNeedDetailRow(definition, itemLabel, metadata, details, assignedPorts)
  );
}

function buildServiceNeedDetailRow(
  definition: ServiceNeedDetailDefinition,
  itemLabel: string | undefined,
  metadata: Record<string, string>,
  details: ServiceNeedDetailField[],
  assignedPorts: ServiceAssignedPortDetail[]
): ServiceNeedDisplayDetail {
  if (definition.label === "Name") {
    return { label: definition.label, value: itemLabel ?? "-", kind: definition.kind };
  }
  if (definition.label === "Service Need") {
    return { label: definition.label, value: metadata["SERVICE-NEED"] ?? "-", kind: definition.kind };
  }
  if (definition.label === "Category") {
    return { label: definition.label, value: metadata.CATEGORY ?? "-", kind: definition.kind };
  }
  if (definition.label === "Port Assignment") {
    return {
      label: definition.label,
      value: formatAssignedPortPrototypeColumn(assignedPorts, metadata["ASSIGNED-PORTS"]),
      kind: definition.kind
    };
  }

  const detail = findServiceNeedDetail(details, definition);
  const rawValue = detail?.value;
  const fallback = definition.defaultValue ?? "-";
  const value = definition.formatter ? definition.formatter(rawValue ?? fallback) : rawValue || fallback;
  const checked =
    definition.kind === "checkbox"
      ? readBinaryServiceNeedDetailValue(value) === true
      : definition.kind === "checkboxDropdown"
        ? value !== "-" && readBinaryServiceNeedDetailValue(value) !== false
        : undefined;
  return {
    label: definition.label,
    value: definition.options ? normalizeServiceNeedOption(value, definition.options) : value,
    kind: definition.kind,
    checked,
    options: definition.options
  };
}

function getNvBlockNeedsDetailRows(
  itemLabel: string | undefined,
  metadata: Record<string, string>,
  details: ServiceNeedDetailField[]
): ServiceNeedDisplayDetail[] {
  return nvBlockNeedsDetailOrder.map((definition) => {
    if (definition.label === "Name") {
      return { label: definition.label, value: itemLabel ?? "-", kind: definition.kind };
    }
    if (definition.label === "Service Need") {
      return { label: definition.label, value: metadata["SERVICE-NEED"] ?? "-", kind: definition.kind };
    }
    if (definition.label === "Category") {
      return { label: definition.label, value: metadata.CATEGORY ?? "-", kind: definition.kind };
    }

    const detail = findServiceNeedDetail(details, definition);
    const value = formatNvBlockNeedDetailValue(definition, detail?.value);
    const checked = definition.kind === "checkbox" ? readBinaryServiceNeedDetailValue(value) === true : undefined;
    return {
      label: definition.label,
      value,
      kind: definition.kind,
      checked
    };
  });
}

function findServiceNeedDetail(
  details: ServiceNeedDetailField[],
  definition: ServiceNeedDetailDefinition
) {
  const expectedKeys = [definition.tag, definition.label, ...(definition.aliases ?? [])]
    .filter((entry): entry is string => Boolean(entry))
    .map(normalizeAutosarEnumToken);
  return details.find((detail) => {
    const keys = [detail.tag, detail.label].filter((entry): entry is string => Boolean(entry)).map(normalizeAutosarEnumToken);
    return keys.some((key) => expectedKeys.includes(key));
  });
}

function formatBytesValue(value: string) {
  if (!value || value === "-") {
    return "0 bytes";
  }
  return /\bbytes?\b/i.test(value) ? value : `${value} bytes`;
}

function normalizeServiceNeedOption(value: string, options: string[]) {
  const normalizedValue = normalizeAutosarEnumToken(value);
  return options.find((option) => normalizeAutosarEnumToken(option) === normalizedValue) ?? value;
}

function getServiceNeedSelectOptions(value: string, options: string[] | undefined) {
  const selectOptions = options && options.length > 0 ? options : [value];
  return selectOptions.includes(value) ? selectOptions : [value, ...selectOptions];
}

function formatNvBlockNeedDetailValue(
  definition: (typeof nvBlockNeedsDetailOrder)[number],
  value: string | undefined
) {
  const fallback = definition.defaultValue ?? "-";
  if (!value || value === "-") {
    return fallback;
  }

  if (definition.tag === "CYCLIC-WRITING-PERIOD") {
    return formatNvBlockCyclicWritingPeriod(value);
  }

  return value;
}

function formatNvBlockCyclicWritingPeriod(value: string) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return value;
  }
  if (numericValue === 0) {
    return "0 sec";
  }
  if (Math.abs(numericValue) >= 1000 && Number.isInteger(numericValue) && numericValue % 1000 === 0) {
    return `${formatNumber(numericValue / 1000)} sec`;
  }
  if (Math.abs(numericValue) >= 1) {
    return `${formatNumber(numericValue)} msec`;
  }
  return formatTimeInterval(value);
}

function parseNvmAssignedDataDetails(
  metadata: Record<string, string>,
  assignedData: ServiceAssignedDataDetail[]
): NvmAssignedDataDetail[] {
  return [
    {
      role: "ramBlock",
      value: findAssignedDataValue(assignedData, "ramblock") ?? metadata["ASSIGNED-DATA-RAM-BLOCK"] ?? "-"
    },
    {
      role: "defaultValue",
      value: findAssignedDataValue(assignedData, "defaultvalue") ?? metadata["ASSIGNED-DATA-DEFAULT-VALUE"] ?? "-"
    }
  ];
}

function findAssignedDataValue(assignments: ServiceAssignedDataDetail[], normalizedRole: string) {
  return assignments.find((assignment) => normalizeAutosarEnumToken(assignment.assignedRole) === normalizedRole)?.value;
}

export function formatAssignedPortPrototypeColumn(
  details: ServiceAssignedPortDetail[],
  fallbackSummary: string | undefined
) {
  if (details.length > 0) {
    return details.map((detail) => detail.portPrototype).filter((value) => value !== "-").join(", ") || "-";
  }

  if (!fallbackSummary) {
    return "-";
  }

  const ports = fallbackSummary.split(",").flatMap((entry) => {
    const separatorIndex = entry.indexOf(":");
    const value = separatorIndex >= 0 ? entry.slice(separatorIndex + 1).trim() : entry.trim();
    return value ? [value] : [];
  });
  return ports.length > 0 ? ports.join(", ") : "-";
}

function parseServiceNeedDetailFields(
  structuredFields: ServiceNeedField[],
  fallbackSummary: string | undefined
): ServiceNeedDetailField[] {
  const fields: Array<{ tag?: string; label: string; value: string }> =
    structuredFields.length > 0
      ? structuredFields
      : parseServiceNeedDetailSummary(fallbackSummary).map((detail) => ({
          label: detail.label,
          value: detail.value
        }));

  return fields.map((detail) => {
    const checked = readBinaryServiceNeedDetailValue(detail.value);
    return {
      tag: detail.tag,
      label: detail.label,
      value: detail.value,
      kind: checked === undefined ? "dropdown" : "checkbox",
      checked: checked === true
    };
  });
}

function parseServiceNeedDetailSummary(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value.split(/,\s+(?=[A-Z][A-Za-z0-9 ]+:\s*)/).flatMap((entry) => {
    const separatorIndex = entry.indexOf(":");
    if (separatorIndex < 0) {
      return [];
    }
    const label = entry.slice(0, separatorIndex).trim();
    const detailValue = entry.slice(separatorIndex + 1).trim();
    return label && detailValue ? [{ label, value: detailValue }] : [];
  });
}

function readBinaryServiceNeedDetailValue(value: string) {
  const normalized = normalizeAutosarEnumToken(value);
  if (normalized === "true" || normalized === "yes" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "no" || normalized === "0") {
    return false;
  }
  return undefined;
}
