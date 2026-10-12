import { statusLabel } from "../labels";
import type { CSSProperties, ReactNode } from "react";
import type { Handle } from "../types";

export type IconName =
  | "workflow"
  | "play"
  | "pause"
  | "step"
  | "bolt"
  | "clock"
  | "branch"
  | "box"
  | "arrow"
  | "check"
  | "plus"
  | "trash"
  | "reset"
  | "code"
  | "cpu"
  | "layers"
  | "activity"
  | "pin"
  | "search"
  | "close"
  | "external"
  | "stop"
  | "chevron"
  | "save"
  | "info";
export function Icon({
  name,
  size = 18,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const paths: Record<IconName, ReactNode> = {
    workflow: (
      <>
        <rect x="3" y="3" width="6" height="6" rx="1.5" />
        <rect x="15" y="15" width="6" height="6" rx="1.5" />
        <rect x="3" y="15" width="6" height="6" rx="1.5" />
        <path d="M6 9v6m3-9h5a4 4 0 0 1 4 4v5" />
      </>
    ),
    play: <path d="m8 4 12 8-12 8Z" />,
    pause: (
      <>
        <path d="M8 5v14M16 5v14" />
      </>
    ),
    step: (
      <>
        <path d="m5 5 10 7-10 7ZM19 5v14" />
      </>
    ),
    bolt: <path d="m14 2-10 12h7l-1 8 10-12h-7Z" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    branch: (
      <>
        <circle cx="6" cy="5" r="2" />
        <circle cx="18" cy="6" r="2" />
        <circle cx="6" cy="19" r="2" />
        <path d="M6 7v10m0-5h5a7 7 0 0 0 7-4" />
      </>
    ),
    box: (
      <>
        <path d="m12 3 9 5v9l-9 5-9-5V8Zm-9 5 9 5 9-5M12 13v9m-5-17 10 6" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
      </>
    ),
    reset: (
      <>
        <path d="M3 10a9 9 0 1 1 1 8M3 4v6h6" />
      </>
    ),
    code: (
      <>
        <path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18" />
      </>
    ),
    cpu: (
      <>
        <rect x="6" y="6" width="12" height="12" rx="2" />
        <path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4" />
        <rect x="10" y="10" width="4" height="4" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 10 5-10 5L2 8Zm-10 10 10 5 10-5M2 18l10 5 10-5" />
      </>
    ),
    activity: <path d="M2 12h5l3-8 4 16 3-8h5" />,
    pin: (
      <>
        <path d="m9 3 6 0-1 6 4 4H6l4-4Zm3 10v8" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    external: (
      <>
        <path d="M14 3h7v7m0-7L10 14M10 3H4v17h17v-6" />
      </>
    ),
    stop: <rect x="5" y="5" width="14" height="14" rx="2" />,
    chevron: <path d="m8 4 8 8-8 8" />,
    save: (
      <>
        <path d="M4 3h13l4 4v14H3V3Zm3 0v7h10V3M7 21v-7h10v7" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7v1" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {paths[name]}
    </svg>
  );
}

export const handleId = (handle: Handle) =>
  `${handle.index}:${handle.generation}`;
export const number = (value: number) => value.toLocaleString("en-US");
export const ms = (value: number) =>
  value < 1
    ? `${value.toFixed(3)} ms`
    : `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} ms`;
export const duration = (value: number) =>
  value < 1000 ? `${number(value)} ms` : `${(value / 1000).toFixed(2)} s`;
export const bytes = (value: number) =>
  value < 1024
    ? `${value} B`
    : value < 1048576
      ? `${(value / 1024).toFixed(1)} KiB`
      : `${(value / 1048576).toFixed(2)} MiB`;
export const json = (value: unknown) => JSON.stringify(value, null, 2);

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`badge badge-${tone}`}>
      <span className="badge-dot" />
      {typeof children === "string" ? statusLabel(children) : children}
    </span>
  );
}
export function Empty({
  icon = "workflow",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon name={icon} size={26} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Metric({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  accent?: string;
}) {
  return (
    <div
      className="metric"
      style={{ "--metric-accent": accent } as CSSProperties}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
export function JsonBlock({
  value,
  title,
}: {
  value: unknown;
  title?: string;
}) {
  return (
    <div className="json-block">
      {title && <div className="json-block-label">{title}</div>}
      <pre>{json(value)}</pre>
    </div>
  );
}
export function Sparkline({
  values,
  color = "#70e0bc",
  height = 92,
  area = true,
  ceiling,
}: {
  values: number[];
  color?: string;
  height?: number;
  area?: boolean;
  ceiling?: number;
}) {
  const max = Math.max(ceiling ?? Math.max(...values, 1), 1);
  const points = values
    .map(
      (v, i) =>
        `${values.length > 1 ? (i / (values.length - 1)) * 500 : 0},${height - 8 - (v / max) * (height - 20)}`,
    )
    .join(" ");
  return (
    <svg
      className="sparkline"
      viewBox={`0 0 500 ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`측정값: ${values.join(", ")}`}
    >
      {[0.25, 0.5, 0.75].map((n) => (
        <line
          key={n}
          x1="0"
          x2="500"
          y1={height * n}
          y2={height * n}
          stroke="#ffffff09"
        />
      ))}
      {values.length > 0 && area && (
        <polygon
          points={`0,${height} ${points} 500,${height}`}
          fill={color}
          opacity=".065"
        />
      )}
      {values.length > 0 && (
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
