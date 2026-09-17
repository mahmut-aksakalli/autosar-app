import type { SwcInspectorItem } from "../../../../../src/shared/contracts";
import {
  formatInitValueTypeOption,
  formatMeasurementCalibrationOption,
  formatReferenceShortName,
  initValueTypeOptions
} from "./DetailsFormatters";
import { InitValueDisplay } from "./InitValueDisplay";

export function PerInstanceMemoryDetails(props: { title: string; item?: SwcInspectorItem }) {
  const metadata = props.item?.metadata ?? {};

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{props.title}</strong>
      </div>
      <div className="model-port-detail">
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Name</span>
            <strong>{props.item?.label ?? "-"}</strong>
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
              <InitValueDisplay
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
