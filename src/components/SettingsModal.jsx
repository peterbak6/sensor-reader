import React from "react";
import {
  getDisplayRefreshLabel,
  getPermissionTone,
  getProcessingIntervalMs,
} from "../lib/sensor-utils.js";

function PermissionButton({ value, label, onClick, disabled = false }) {
  const tone = getPermissionTone(value);
  const isReady = tone === "good";
  const buttonLabel = isReady ? "On" : "Enable";

  return (
    <button
      className={`permission-enable-button ${tone}`}
      type="button"
      title={`${label}: ${value}`}
      aria-label={`${buttonLabel} ${label}`}
      onClick={onClick}
      disabled={disabled}
    >
      {buttonLabel}
    </button>
  );
}

function PermissionRow({ label, value, onEnable, disabled }) {
  return (
    <div className="permission-row">
      <span>{label}:</span>
      <strong>{value}</strong>
      <PermissionButton
        value={value}
        label={label}
        onClick={onEnable}
        disabled={disabled}
      />
    </div>
  );
}

function WakeLockRow({ wakeLock, onToggle }) {
  const value = wakeLock.status;
  const buttonLabel = wakeLock.active ? "On" : "Enable";

  return (
    <div className="permission-row">
      <span>Wake Lock:</span>
      <strong>{value}</strong>
      <button
        className={`permission-enable-button ${getPermissionTone(value)}`}
        type="button"
        title={`Wake Lock: ${value}`}
        aria-label={`${buttonLabel} Wake Lock`}
        onClick={onToggle}
        disabled={!wakeLock.supported}
      >
        {buttonLabel}
      </button>
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
        <span>{`tau x${profile.tauScale}`}</span>
        <span>Stable</span>
      </div>
    </section>
  );
}

function SelectControl({ id, label, value, onChange, children }) {
  return (
    <label className="select-control" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

export default function SettingsModal({
  open,
  permissions,
  wakeLock,
  noiseReduction,
  noiseProfile,
  displayFps,
  displayDigits,
  processingMode,
  status,
  onNoiseChange,
  onDisplayFpsChange,
  onDisplayDigitsChange,
  onProcessingModeChange,
  onEnableMotion,
  onEnableOrientation,
  onEnableLocation,
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
          <PermissionRow
            label="Motion"
            value={permissions.motion}
            onEnable={onEnableMotion}
            disabled={permissions.motion === "unsupported"}
          />
          <PermissionRow
            label="Orientation"
            value={permissions.orientation}
            onEnable={onEnableOrientation}
            disabled={permissions.orientation === "unsupported"}
          />
          <PermissionRow
            label="Location"
            value={permissions.geolocation}
            onEnable={onEnableLocation}
            disabled={permissions.geolocation === "unsupported"}
          />
          <WakeLockRow wakeLock={wakeLock} onToggle={onToggleWakeLock} />
        </div>

        <h2 className="settings-subtitle">Refresh</h2>
        <p className="refresh-label">
          {`Screen refresh: ${getDisplayRefreshLabel(displayFps)}`}
        </p>
        <div className="settings-grid">
          <SelectControl
            id="displayFps"
            label="Display"
            value={String(displayFps)}
            onChange={(value) => onDisplayFpsChange(Number(value))}
          >
            <option value="1">1 fps</option>
            <option value="2">2 fps</option>
            <option value="4">4 fps</option>
            <option value="8">8 fps</option>
            <option value="16">16 fps</option>
          </SelectControl>
          <SelectControl
            id="displayDigits"
            label="Decimals"
            value={String(displayDigits)}
            onChange={(value) => onDisplayDigitsChange(Number(value))}
          >
            <option value="1">1 digit</option>
            <option value="2">2 digits</option>
            <option value="3">3 digits</option>
            <option value="4">4 digits</option>
          </SelectControl>
        </div>
        <NoiseControl
          value={noiseReduction}
          profile={noiseProfile}
          onChange={onNoiseChange}
        />
        <h2 className="settings-subtitle">Battery</h2>
        <SelectControl
          id="processingMode"
          label="Sensor processing"
          value={processingMode}
          onChange={onProcessingModeChange}
        >
          <option value="native">Native event rate</option>
          <option value="balanced">Balanced, 30 Hz max</option>
          <option value="saver">Saver, 10 Hz max</option>
        </SelectControl>
        <p className="settings-note">
          {processingMode === "native"
            ? "Sensors feed the smoother at the browser event rate. The screen only samples the latest values."
            : `Sensor samples faster than ${getProcessingIntervalMs(processingMode)}ms are skipped before smoothing.`}
        </p>
      </section>
    </div>
  );
}
