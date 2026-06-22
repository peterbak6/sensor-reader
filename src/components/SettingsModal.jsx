import React from "react";
import { getPermissionTone, getRefreshLabel } from "../lib/sensor-utils.js";

function StatusDot({ value }) {
  return (
    <span
      className={`status-dot ${getPermissionTone(value)}`}
      title={value}
      aria-label={value}
    />
  );
}

function PermissionRow({ label, value }) {
  return (
    <div className="permission-row">
      <span>{label}:</span>
      <strong>{value}</strong>
      <StatusDot value={value} />
    </div>
  );
}

function NoiseControl({ value, profile, onChange }) {
  return (
    <section className="control-panel" aria-label="Noise reduction control">
      <div className="control-top">
        <label htmlFor="noiseReduction">Noise reduction</label>
        <strong>{`${profile.label} ${profile.level}%`}</strong>
      </div>
      <input
        id="noiseReduction"
        className="noise-slider"
        type="range"
        min="0"
        max="100"
        step="1"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="control-meta">
        <span>Responsive</span>
        <span>{getRefreshLabel(profile)}</span>
        <span>Stable</span>
      </div>
    </section>
  );
}

export default function SettingsModal({
  open,
  permissions,
  wakeLock,
  noiseReduction,
  noiseProfile,
  status,
  onNoiseChange,
  onToggleWakeLock,
  onClose,
}) {
  if (!open) return null;

  return (
    <div className="settings-modal-backdrop" role="presentation">
      <section className="settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
        <button
          className="modal-close-button"
          type="button"
          onClick={onClose}
          aria-label="Close settings"
        >
          X
        </button>

        <h2>Settings</h2>
        <p className="modal-status">{status}</p>

        <div className="permission-list">
          <PermissionRow label="Motion" value={permissions.motion} />
          <PermissionRow label="Orientation" value={permissions.orientation} />
          <PermissionRow label="Location" value={permissions.geolocation} />
          <PermissionRow label="Wake Lock" value={wakeLock.status} />
        </div>

        <button
          className={`wake-lock-button ${wakeLock.active ? "active" : ""}`}
          type="button"
          onClick={onToggleWakeLock}
          disabled={!wakeLock.supported}
        >
          {wakeLock.supported
            ? wakeLock.active
              ? "Screen awake: On"
              : "Keep screen awake"
            : "Wake Lock unsupported"}
        </button>

        <h2 className="settings-subtitle">Refresh</h2>
        <p className="refresh-label">
          {`Refresh rate: ${getRefreshLabel(noiseProfile)}`}
        </p>
        <NoiseControl
          value={noiseReduction}
          profile={noiseProfile}
          onChange={onNoiseChange}
        />
      </section>
    </div>
  );
}
