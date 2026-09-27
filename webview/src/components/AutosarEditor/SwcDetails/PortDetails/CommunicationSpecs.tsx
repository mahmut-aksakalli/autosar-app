import { useState, type ReactNode } from "react";
import type { AutosarEntity, CommunicationSpecDetail, InterfaceDetailMember, PortInterfaceKind } from "../../../../../../src/shared/contracts";
import { CollapsibleSection } from "../../../Common/CollapsibleSection";
import { MemberReferencePath } from "../../../Common/Details/MemberRelationship/MemberReferencePath";
import { MemberRelationshipView } from "../../../Common/Details/MemberRelationship/MemberRelationshipView";
import { OperationSignature } from "../../../Common/Details/MemberRelationship/OperationSignature";
import { OperationPossibleErrors } from "../../../Common/Details/MemberRelationship/OperationPossibleErrors";
import {
  formatHandleInvalidOption,
  formatInitValueTypeOption,
  formatMeasurementCalibrationOption,
  formatOptionalMilliseconds,
  formatReferenceShortName,
  initValueTypeOptions,
  readBooleanMetadata,
  readEnabledMetadata,
  splitMetadataList
} from "../../../Common/Details/DetailsFormatters";
import { InitValueDisplay } from "../../../Common/Details/InitValueDisplay";
import {
  ReferenceOpenButton,
  ReferenceValue
} from "../../../Common/Details/ReferenceValue";
import {
  formatCommunicationSpecDirectionLabel,
  formatHandleOutOfRangeOption,
  formatRxFilterOption,
  formatTransmissionModeOption,
  getCommunicationSpecItemLabel,
  getRxFilterOptions,
  handleOutOfRangeOptions,
  transmissionModeOptions
} from "./CommunicationSpecHelper";

export function CommunicationSpecsSection(props: {
  rows: CommunicationSpecDetail[];
  interfaceKind: PortInterfaceKind;
  interfaceRef?: string;
  interfaceMembers?: InterfaceDetailMember[];
  title?: string;
  entities?: AutosarEntity[];
  onOpenReferencedEntity?: (referencePath: string) => void;
  canOpenReferencedEntity?: (referencePath: string) => boolean;
}) {
  const itemLabel = getCommunicationSpecItemLabel(props.interfaceKind);
  const [selectedKey, setSelectedKey] = useState<string | undefined>(() =>
    props.rows[0] ? getCommunicationSpecRowKey(props.rows[0]) : undefined
  );
  // Use a value-based key instead of object identity because graph refreshes
  // replace the row objects even when the selected communication spec remains.
  const selectedRow = props.rows.find((row) => getCommunicationSpecRowKey(row) === selectedKey) ?? props.rows[0];
  const hasComSpecs = props.title !== "Interface Members";
  const interfaceEntity = props.entities?.find((entity) =>
    entity.type === "interface" && entity.semanticPath === props.interfaceRef
  );
  const members = interfaceEntity?.details?.interfaceMembers ?? props.interfaceMembers ?? [];
  const selectedOperation = props.interfaceKind === "client-server" && selectedRow
    ? members.find((member) => member.kind === "operation" && matchesMemberReference(selectedRow.dataElement, member))
    : undefined;
  const applicationErrors = members.filter((member) => member.kind === "applicationError");
  const items = props.rows.map((row) => ({
    key: getCommunicationSpecRowKey(row),
    number: row.index,
    label: formatReferenceShortName(row.dataElement),
    description: hasComSpecs
      ? `${formatCommunicationSpecDirectionLabel(row.comSpecDirection)} ComSpec`
      : itemLabel
  }));
  let detailsContent: ReactNode = null;
  if (!selectedRow) {
    detailsContent = <div className="model-list-empty">Select a communication spec.</div>;
  } else if (props.interfaceKind !== "client-server") {
    detailsContent = (
      <CommunicationSpecDetails
        row={selectedRow}
        itemLabel={itemLabel}
        onOpenReferencedEntity={props.onOpenReferencedEntity}
        canOpenReferencedEntity={props.canOpenReferencedEntity}
      />
    );
  }

  return (
    <MemberRelationshipView
      title={hasComSpecs ? `${itemLabel}s and ComSpecs` : `${itemLabel}s`}
      items={items}
      selectedKey={selectedRow ? getCommunicationSpecRowKey(selectedRow) : undefined}
      onSelect={setSelectedKey}
      selectedKind={itemLabel}
      selectedName={selectedRow ? formatReferenceShortName(selectedRow.dataElement) : undefined}
      listFooter={selectedOperation && applicationErrors.length > 0 ? (
        <OperationPossibleErrors
          applicationErrors={applicationErrors}
          selectedErrors={splitMetadataList(selectedOperation.metadata?.ERRORS)}
        />
      ) : undefined}
      focus={selectedOperation ? (
        <OperationSignature
          key={selectedOperation.semanticPath ?? selectedOperation.label}
          operation={selectedOperation}
          entities={props.entities}
          onOpenReferencedEntity={props.onOpenReferencedEntity}
          canOpenReferencedEntity={props.canOpenReferencedEntity}
        />
      ) : undefined}
      path={!selectedOperation && selectedRow ? (
        <MemberReferencePath
          dataType={selectedRow.dataType}
          dataConstraints={selectedRow.dataConstraints}
          entities={props.entities}
          onOpenReferencedEntity={props.onOpenReferencedEntity}
          canOpenReferencedEntity={props.canOpenReferencedEntity}
        />
      ) : undefined}
    >
      {detailsContent}
    </MemberRelationshipView>
  );
}

function getCommunicationSpecRowKey(row: CommunicationSpecDetail) {
  return `${row.index}:${row.dataElement}:${row.comSpec}:${row.initValue}`;
}

function matchesMemberReference(reference: string, member: InterfaceDetailMember) {
  if (reference.startsWith("/")) {
    return reference === member.semanticPath;
  }
  return formatReferenceShortName(reference) === member.label;
}

function CommunicationSpecDetails(props: {
  row: CommunicationSpecDetail;
  itemLabel: string;
  onOpenReferencedEntity?: (referencePath: string) => void;
  canOpenReferencedEntity?: (referencePath: string) => boolean;
}) {
  return (
    <div className="model-communication-spec-details">
      <CollapsibleSection title={`${props.itemLabel} Properties`} defaultOpen>
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Data Type</span>
            <ReferenceValue
              referencePath={props.row.dataType}
              onOpen={props.onOpenReferencedEntity}
              canOpen={props.canOpenReferencedEntity}
            />
          </div>
          <div>
            <span>Data Constraints</span>
            <ReferenceValue
              referencePath={props.row.dataConstraints}
              onOpen={props.onOpenReferencedEntity}
              canOpen={props.canOpenReferencedEntity}
            />
          </div>
          <div>
            <span>Addressing Method</span>
            <strong>{formatReferenceShortName(props.row.addressingMethod)}</strong>
          </div>
          <div>
            <span>Use queued communication</span>
            <strong>
              <input type="checkbox" checked={readBooleanMetadata(props.row.useQueuedCommunication) === true} disabled readOnly />
            </strong>
          </div>
          <div>
            <span>Measurement&amp;Calibration</span>
            <strong>
              <select value={formatMeasurementCalibrationOption(props.row.measurementCalibration)} disabled>
                <option>Not Accessible</option>
                <option>Read</option>
                <option>Write</option>
                <option>ReadWrite</option>
              </select>
            </strong>
          </div>
          <div>
            <span>Handle invalid</span>
            <strong>
              <select value={formatHandleInvalidOption(props.row.handleInvalid)} disabled>
                <option>Keep</option>
                <option>Replace</option>
                <option>None</option>
              </select>
            </strong>
          </div>
        </div>
      </CollapsibleSection>

      {props.row.comSpecDirection === "sender" && (
        <SenderComSpecDetails
          row={props.row}
          onOpenReferencedEntity={props.onOpenReferencedEntity}
          canOpenReferencedEntity={props.canOpenReferencedEntity}
        />
      )}
      {props.row.comSpecDirection === "receiver" && (
        <ReceiverComSpecDetails
          row={props.row}
          onOpenReferencedEntity={props.onOpenReferencedEntity}
          canOpenReferencedEntity={props.canOpenReferencedEntity}
        />
      )}
      {props.row.comSpecDirection !== "sender" && props.row.comSpecDirection !== "receiver" && (
        <GenericComSpecDetails
          row={props.row}
          onOpenReferencedEntity={props.onOpenReferencedEntity}
          canOpenReferencedEntity={props.canOpenReferencedEntity}
        />
      )}
    </div>
  );
}

function SenderComSpecDetails(props: {
  row: CommunicationSpecDetail;
  onOpenReferencedEntity?: (referencePath: string) => void;
  canOpenReferencedEntity?: (referencePath: string) => boolean;
}) {
  return (
    <CollapsibleSection title="Sender ComSpec" defaultOpen>
      <div className="model-semantic-kv model-port-fields">
        <div>
          <span>Init Value</span>
          <strong className="model-inline-value-with-select">
            <select value={formatInitValueTypeOption(props.row.initValueType)} disabled>
              {initValueTypeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            <InitValueDisplay value={props.row.initValue} type={props.row.initValueType} />
            <ReferenceOpenButton
              referencePath={props.row.initValueRef}
              onOpen={props.onOpenReferencedEntity}
              canOpen={props.canOpenReferencedEntity}
            />
          </strong>
        </div>
        <div className="model-semantic-kv-three">
          <span>Uses Tx Acknowledge</span>
          <strong>
            <input type="checkbox" checked={readBooleanMetadata(props.row.usesTxAcknowledge) === true} disabled readOnly />
          </strong>
          <strong className="model-inline-value-with-label">
            <small>Timeout (ms)</small>
            {formatOptionalMilliseconds(props.row.transmissionAcknowledgeTimeout)}
          </strong>
        </div>
        <div>
          <span>Uses End-to-End Protection</span>
          <strong>
            <input type="checkbox" checked={readBooleanMetadata(props.row.usesEndToEndProtection) === true} disabled readOnly />
          </strong>
        </div>
        <div>
          <span>Handle Out of Range</span>
          <strong>
            <select value={formatHandleOutOfRangeOption(props.row.handleOutOfRange)} disabled>
              {handleOutOfRangeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </strong>
        </div>
      </div>
      <section className="model-port-argument-section">
        <h3>Use Transmission Props</h3>
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Transmission Mode</span>
            <strong>
              <select value={formatTransmissionModeOption(props.row.transmissionMode)} disabled>
                {transmissionModeOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </strong>
          </div>
          <div>
            <span>Data Update Period</span>
            <strong>{formatOptionalMilliseconds(props.row.dataUpdatePeriod)}</strong>
          </div>
          <div>
            <span>Minimum Send Interval</span>
            <strong>{formatOptionalMilliseconds(props.row.minimumSendInterval)}</strong>
          </div>
        </div>
      </section>
    </CollapsibleSection>
  );
}

function ReceiverComSpecDetails(props: {
  row: CommunicationSpecDetail;
  onOpenReferencedEntity?: (referencePath: string) => void;
  canOpenReferencedEntity?: (referencePath: string) => boolean;
}) {
  return (
    <CollapsibleSection title="Receiver ComSpec" defaultOpen>
      <div className="model-semantic-kv model-port-fields">
        <div>
          <span>Init Value</span>
          <strong className="model-inline-value-with-select">
            <select value={formatInitValueTypeOption(props.row.initValueType)} disabled>
              {initValueTypeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            <InitValueDisplay value={props.row.initValue} type={props.row.initValueType} />
            <ReferenceOpenButton
              referencePath={props.row.initValueRef}
              onOpen={props.onOpenReferencedEntity}
              canOpen={props.canOpenReferencedEntity}
            />
          </strong>
        </div>
        <div>
          <span>Rx Filter</span>
          <strong>
            <select value={formatRxFilterOption(props.row.rxFilter)} disabled>
              {getRxFilterOptions(props.row.rxFilter).map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </strong>
        </div>
        <div>
          <span>Uses End-to-End Protection</span>
          <strong>
            <input type="checkbox" checked={readBooleanMetadata(props.row.usesEndToEndProtection) === true} disabled readOnly />
          </strong>
        </div>
        <div>
          <span>Handle Never Received</span>
          <strong>
            <input type="checkbox" checked={readEnabledMetadata(props.row.handleNeverReceived)} disabled readOnly />
          </strong>
        </div>
        <div>
          <span>Enable Update</span>
          <strong>
            <input type="checkbox" checked={readBooleanMetadata(props.row.enableUpdate) === true} disabled readOnly />
          </strong>
        </div>
        <div>
          <span>Alive Timeout</span>
          <strong>{formatOptionalMilliseconds(props.row.aliveTimeout)}</strong>
        </div>
        <div>
          <span>Queue Length</span>
          <strong>{props.row.queueLength}</strong>
        </div>
        <div>
          <span>Handle Out Of Range</span>
          <strong>
            <select value={formatHandleOutOfRangeOption(props.row.handleOutOfRange)} disabled>
              {handleOutOfRangeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </strong>
        </div>
      </div>
    </CollapsibleSection>
  );
}

function GenericComSpecDetails(props: {
  row: CommunicationSpecDetail;
  onOpenReferencedEntity?: (referencePath: string) => void;
  canOpenReferencedEntity?: (referencePath: string) => boolean;
}) {
  return (
    <CollapsibleSection title={`${formatCommunicationSpecDirectionLabel(props.row.comSpecDirection)} ComSpec`} defaultOpen>
      <div className="model-semantic-kv model-port-fields">
        <div>
          <span>Init Value</span>
          <strong className="model-inline-value-with-select">
            <select value={formatInitValueTypeOption(props.row.initValueType)} disabled>
              {initValueTypeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            <InitValueDisplay value={props.row.initValue} type={props.row.initValueType} />
            <ReferenceOpenButton
              referencePath={props.row.initValueRef}
              onOpen={props.onOpenReferencedEntity}
              canOpen={props.canOpenReferencedEntity}
            />
          </strong>
        </div>
        <div>
          <span>Queue Length</span>
          <strong>{props.row.queueLength}</strong>
        </div>
      </div>
    </CollapsibleSection>
  );
}
