import type { DetailBreadcrumb } from "./DetailsBottomTabs";
import "./DetailsBottomTabs.css";

export function BreadcrumbTrail(props: { title: string; breadcrumbs?: DetailBreadcrumb[] }) {
  const breadcrumbs = props.breadcrumbs?.length ? props.breadcrumbs : [{ label: props.title }];

  return (
    <nav className="model-details-breadcrumbs" aria-label="Details path">
      {breadcrumbs.map((crumb, index) => (
        <span key={`${crumb.label}:${index}`} className="model-details-breadcrumb-item">
          {index > 0 && <span className="model-details-breadcrumb-separator" aria-hidden="true">›</span>}
          {crumb.onClick ? (
            <button type="button" onClick={crumb.onClick} title={crumb.label}>{crumb.label}</button>
          ) : (
            <strong aria-current={index === breadcrumbs.length - 1 ? "page" : undefined} title={crumb.label}>
              {crumb.label}
            </strong>
          )}
        </span>
      ))}
    </nav>
  );
}
