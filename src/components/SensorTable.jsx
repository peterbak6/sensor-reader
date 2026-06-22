import React from "react";
import { formatValue } from "../lib/sensor-utils.js";

export default function SensorTable({
  title,
  rows,
  digits,
  actionLabel,
  actionIcon,
  onAction,
}) {
  return (
    <section className="sensor-section">
      <div className="section-header">
        <h2 className="section-title">{title}</h2>
        {onAction && (
          <button
            className="table-action-button"
            type="button"
            onClick={onAction}
            aria-label={actionLabel}
            title={actionLabel}
          >
            {actionIcon}
          </button>
        )}
      </div>
      <div className="sensor-table" role="table" aria-label={title}>
        <div className="table-row table-head" role="row">
          <div role="columnheader">Signal</div>
          <div role="columnheader">Raw</div>
          <div role="columnheader">Smoothed</div>
        </div>
        {rows.map((row) => (
          <div className="table-row" role="row" key={row.label}>
            <div className="signal" role="cell">
              {row.label}
            </div>
            <div className="value" role="cell">
              {formatValue(row.raw, digits)}
            </div>
            <div className="value smooth" role="cell">
              {formatValue(row.smoothed, digits)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
