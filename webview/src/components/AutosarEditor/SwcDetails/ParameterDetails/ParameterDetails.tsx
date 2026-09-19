import type { SwcInspectorItem } from "../../../../../../src/shared/contracts";
import {
  formatInitValueTypeOption,
  formatMeasurementCalibrationOption,
  formatParameterScopeOption,
  formatReferenceShortName,
  initValueTypeOptions
} from "../../../Common/Details/DetailsFormatters";
import { InitValueDisplay } from "../../../Common/Details/InitValueDisplay";
import { ReferenceValue } from "../../../Common/Details/ReferenceValue";

export function ParameterDetails(props: {
  title: string;
  parameter?: SwcInspectorItem;
  onOpenReferencedEntity?: (referencePath: string) => void;
  canOpenReferencedEntity?: (referencePath: string) => boolean;
}) {
  const metadata = props.parameter?.metadata ?? {};
  const scope = formatParameterScopeOption(metadata.SCOPE);
  const measurementCalibration = formatMeasurementCalibrationOption(metadata["SW-CALIBRATION-ACCESS"] ?? "-");

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{props.title}</strong>
      </div>
      <div className="model-port-detail">
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Parameter Name</span>
            <strong>{props.parameter?.label ?? "-"}</strong>
          </div>
          <div>
            <span>Type</span>
            <ReferenceValue
              referencePath={metadata.TYPE}
              onOpen={props.onOpenReferencedEntity}
              canOpen={props.canOpenReferencedEntity}
            />
          </div>
          <div>
            <span>Init Value</span>
            <strong className="model-inline-value-with-select">
              <select value={formatInitValueTypeOption(metadata["INITIAL-VALUE-TYPE"] ?? "-")} disabled>
                {initValueTypeOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
              <InitValueDisplay
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
