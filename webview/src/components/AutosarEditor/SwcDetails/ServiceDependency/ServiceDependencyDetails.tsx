import type {
  ServiceAssignedDataDetail,
  ServiceAssignedPortDetail,
  SwcInspectorItem
} from "../../../../../../src/shared/contracts";
import { normalizeAutosarEnumToken } from "../../../Common/Details/DetailsFormatters";
import {
  getServiceNeedDetailRows,
  getServiceNeedSelectOptions,
  parseNvmAssignedDataDetails,
  parseServiceNeedDetailFields
} from "./ServiceDependencyHelper";
import type { NvmAssignedDataDetail, ServiceNeedDisplayDetail } from "./ServiceDependencyHelper";

export function ServiceDependencyDetails(props: { title: string; item?: SwcInspectorItem }) {
  const metadata = props.item?.metadata ?? {};
  const serviceNeedDetails = parseServiceNeedDetailFields(
    props.item?.details?.serviceNeedFields ?? [],
    metadata["SERVICE-NEED-DETAILS"]
  );
  const serviceType = normalizeAutosarEnumToken(metadata["SERVICE-TYPE"] ?? "");
  const isNvBlockNeeds = serviceType === "nvblockneeds";
  const isDiagnosticEnableConditionNeeds = serviceType === "diagnosticenableconditionneeds";
  const detailRows = getServiceNeedDetailRows(
    props.item?.label,
    metadata,
    serviceNeedDetails,
    props.item?.details?.assignedPorts ?? []
  );
  const assignedData = isNvBlockNeeds
    ? parseNvmAssignedDataDetails(metadata, props.item?.details?.assignedData ?? [])
    : [];
  const dataAssignments = isDiagnosticEnableConditionNeeds
    ? props.item?.details?.assignedData ?? []
    : [];
  const assignedPorts = props.item?.details?.assignedPorts ?? [];

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{props.title}</strong>
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
  return (
    <div>
      <span>{props.detail.label}</span>
      <strong>
        {props.detail.kind === "checkbox" ? (
          <input type="checkbox" checked={props.detail.checked === true} disabled readOnly />
        ) : props.detail.kind === "checkboxDropdown" ? (
          <span className="model-inline-value-with-select">
            <input type="checkbox" checked={props.detail.checked === true} disabled readOnly />
            <select value={props.detail.value || "-"} disabled>
              {getServiceNeedSelectOptions(props.detail.value || "-", props.detail.options).map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </span>
        ) : props.detail.kind === "dropdown" ? (
          <select value={props.detail.value || "-"} disabled>
            <option>{props.detail.value || "-"}</option>
          </select>
        ) : props.detail.value}
      </strong>
    </div>
  );
}

function NvmAssignedDataTable(props: { rows: NvmAssignedDataDetail[] }) {
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
            {props.rows.map((row) => (
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
  return (
    <section className="model-port-argument-section">
      <h3>Data Assignments</h3>
      {props.rows.length > 0 ? (
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
              {props.rows.map((row, index) => (
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
  return (
    <section className="model-port-argument-section">
      <h3>{props.title ?? "Assigned Ports"}</h3>
      {props.rows.length > 0 ? (
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
              {props.rows.map((row, index) => (
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
