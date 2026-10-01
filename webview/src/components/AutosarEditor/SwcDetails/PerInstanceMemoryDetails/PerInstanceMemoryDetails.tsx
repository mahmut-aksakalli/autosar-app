import type { SwcInspectorItem } from "../../../../../../src/shared/contracts";
import {
  formatInitValueTypeOption,
  formatMeasurementCalibrationOption,
  formatReferenceShortName,
  initValueTypeOptions
} from "../../../Common/Details/DetailsFormatters";
import { InitValueDisplay } from "../../../Common/Details/InitValueDisplay";
import { ReferenceValue } from "../../../Common/Details/ReferenceValue";
import { DetailsBottomTabs, type DetailBreadcrumb } from "../../../Common/Details/DetailsBottomTabs/DetailsBottomTabs";
import { DetailRelationship, referenceRelationship } from "../../../Common/Details/DetailRelationship/DetailRelationship";
import { DetailGeneralPanel } from "../../../Common/Details/DetailGeneralPanel/DetailGeneralPanel";

export function PerInstanceMemoryDetails(props: {
  title: string;
  item?: SwcInspectorItem;
  onOpenReferencedEntity?: (referencePath: string) => void;
  canOpenReferencedEntity?: (referencePath: string) => boolean;
  breadcrumbs?: DetailBreadcrumb[];
}) {
  const metadata = props.item?.metadata ?? {};
  const targets = [
    referenceRelationship("Data Type", metadata.TYPE),
    referenceRelationship("Nvm Block Need", metadata["NVM-BLOCK-NEED"]),
    referenceRelationship("Addressing Method", metadata["SW-ADDR-METHOD-REF"])
  ].filter((target) => target !== undefined);
  const owner = props.breadcrumbs?.[0];

  return (
    <DetailsBottomTabs
      title={props.title}
      contextKey={props.item?.id ?? props.title}
      breadcrumbs={props.breadcrumbs}
      topContent={<DetailRelationship
        source={owner ? { role: "Software Component", name: owner.label, onClick: owner.onClick } : undefined}
        sourceLink="defines"
        current={{ role: "Per-Instance Memory", name: props.item?.label ?? "-" }}
        targets={targets}
        onOpenReference={props.onOpenReferencedEntity}
        canOpenReference={props.canOpenReferencedEntity}
      />}
      tabs={[{ id: "general", label: "General", content: (
        <DetailGeneralPanel>
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Name</span>
            <strong>{props.item?.label ?? "-"}</strong>
          </div>
          <div>
            <span>Data Type</span>
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
        </DetailGeneralPanel>
      ) }]}
    />
  );
}
