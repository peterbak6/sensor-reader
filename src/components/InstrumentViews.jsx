import React from "react";
import { formatValue, round } from "../lib/sensor-utils.js";

function normalizeDegrees(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return ((value % 360) + 360) % 360;
}

function cardinalFor(degrees) {
  if (degrees == null) return "--";
  const labels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return labels[Math.round(degrees / 45) % labels.length];
}

function displayHeading(orientation) {
  const heading =
    orientation.smoothed.webkitCompassHeading ?? orientation.smoothed.alpha;
  return normalizeDegrees(heading);
}

function getLevelState(beta, gamma) {
  const threshold = 0.5;
  const betaLevel = typeof beta === "number" && Math.abs(beta) <= threshold;
  const gammaLevel = typeof gamma === "number" && Math.abs(gamma) <= threshold;

  if (betaLevel && gammaLevel) return "exact";
  if (betaLevel || gammaLevel) return "partial";
  return "off";
}

function TickMarks() {
  return Array.from({ length: 72 }, (_, index) => (
    <span
      className={index % 6 === 0 ? "compass-tick major" : "compass-tick"}
      style={{ transform: `rotate(${index * 5}deg)` }}
      key={index}
    />
  ));
}

function DegreeLabels() {
  return [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(
    (degree) => (
      <span
        className="compass-degree"
        style={{ transform: `rotate(${degree}deg) translateY(-126px) rotate(${-degree}deg)` }}
        key={degree}
      >
        {degree}
      </span>
    ),
  );
}

export function CompassView({ orientation, onClose }) {
  const heading = displayHeading(orientation);
  const label = heading == null ? "--" : `${Math.round(heading)}° ${cardinalFor(heading)}`;

  return (
    <main className="instrument-screen">
      <header className="instrument-header">
        <h1>My Sensor Reader</h1>
        <button
          className="instrument-close-button"
          type="button"
          onClick={onClose}
          aria-label="Close compass"
        >
          X
        </button>
      </header>
      <section className="instrument-body compass-body" aria-label="Compass">
        <p className="instrument-value">{label}</p>
        <div className="compass-widget">
          <div className="compass-dial" style={{ transform: `rotate(${-heading || 0}deg)` }}>
            <TickMarks />
            <DegreeLabels />
            <span className="cardinal north">N</span>
            <span className="cardinal east">E</span>
            <span className="cardinal south">S</span>
            <span className="cardinal west">W</span>
          </div>
          <span className="compass-pointer" />
          <span className="compass-center" />
        </div>
      </section>
    </main>
  );
}

export function LevelView({ orientation, onClose }) {
  const alpha = orientation.smoothed.alpha;
  const beta = orientation.smoothed.beta;
  const gamma = orientation.smoothed.gamma;
  const ballX = Math.max(-86, Math.min(86, (gamma ?? 0) * 2.2));
  const ballY = Math.max(-86, Math.min(86, (beta ?? 0) * 2.2));
  const tilt = Math.hypot(beta ?? 0, gamma ?? 0);
  const levelState = getLevelState(beta, gamma);

  return (
    <main className="instrument-screen">
      <header className="instrument-header">
        <h1>My Sensor Reader</h1>
        <button
          className="instrument-close-button"
          type="button"
          onClick={onClose}
          aria-label="Close level"
        >
          X
        </button>
      </header>
      <section className="instrument-body level-body" aria-label="Level">
        <div className="level-readouts">
          <span>{`α ${formatValue(alpha, 1)}°`}</span>
          <span>{`β ${formatValue(beta, 1)}°`}</span>
          <span>{`γ ${formatValue(gamma, 1)}°`}</span>
        </div>
        <div className="level-widget">
          <span className="level-line diagonal-a" />
          <span className="level-line diagonal-b" />
          <span className="level-center-dot" />
          <span
            className={`level-ball ${levelState}`}
            style={{ transform: `translate(${round(ballX, 1)}px, ${round(ballY, 1)}px)` }}
          />
        </div>
        <p className="level-tilt">{`${formatValue(tilt, 1)}° tilt`}</p>
      </section>
    </main>
  );
}
