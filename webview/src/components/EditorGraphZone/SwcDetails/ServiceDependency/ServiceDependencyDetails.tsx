import type {
  ServiceAssignedDataDetail,
  ServiceAssignedPortDetail,
  SwcInspectorItem
} from "../../../../../../src/shared/contracts";
import { normalizeAutosarEnumToken } from "../DetailsFormatters";
import {
  getServiceNeedDetailRows,
  getServiceNeedSelectOptions,
  parseNvmAssignedDataDetails,
  parseServiceNeedDetailFields
} from "./ServiceDependencyHelper";
import type { NvmAssignedDataDetail, ServiceNeedDisplayDetail } from "./ServiceDependencyHelper";

export function ServiceDependencyDetails(props: { title: string; item?: SwcInspectorItem }) {
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
            <ServiceNeedDetailRow key={detail.label} detail={detail} />
          ))}
        </div>
        {isNvBlockNeeds ? <NvmAssignedDataTable rows={assignedData} /> : null}
        {isDiagnosticEnableConditionNeeds ? <ServiceDataAssignmentsTable rows={dataAssignments} /> : null}
        <ServiceAssignedPortsTable
          rows={assignedPorts}
          title={isDiagnosticEnableConditionNeeds ? "Port Assignments" : "Assigned Ports"}
        />
      </div>
    </div>
  );
}

function ServiceNeedDetailRow(props: { detail: ServiceNeedDisplayDetail }) {
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

function NvmAssignedDataTable(props: { rows: NvmAssignedDataDetail[] }) {
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

function ServiceDataAssignmentsTable(props: { rows: ServiceAssignedDataDetail[] }) {
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

function ServiceAssignedPortsTable(props: { rows: ServiceAssignedPortDetail[]; title?: string }) {
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
