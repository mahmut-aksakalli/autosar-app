import type { DetailBreadcrumb } from "./DetailsBottomTabs/DetailsBottomTabs";
import { BreadcrumbTrail } from "./DetailsBottomTabs/BreadcrumbTrail";

/** Keep incomplete details out of view until their relationship data is ready. */
export function DetailsLoading(props: {
  title: string;
  message: string;
  breadcrumbs?: DetailBreadcrumb[];
  loading?: boolean;
}) {
  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <BreadcrumbTrail title={props.title} breadcrumbs={props.breadcrumbs} />
      </div>
      <div className="model-details-loading" role="status" aria-live="polite">
        {props.loading !== false && <span className="model-details-loading-spinner" aria-hidden="true" />}
        <span>{props.message}</span>
      </div>
    </div>
  );
}
