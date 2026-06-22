import React, { useEffect, useRef, useState } from "react";
import { formatValue, round } from "../lib/sensor-utils.js";

const MAPLIBRE_VERSION = "4.7.1";
const MAPLIBRE_SCRIPT_ID = "maplibre-gl-script";
const MAPLIBRE_STYLE_ID = "maplibre-gl-style";
const FALLBACK_COORDS = [35.093, 32.661];
const DARK_MAP_STYLE = {
  version: 8,
  sources: {
    cartoLight: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    },
  },
  layers: [
    {
      id: "cartoDark",
      type: "raster",
      source: "cartoLight",
    },
  ],
};

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

function shortestDegreeDelta(from, to) {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

function useContinuousHeading(heading) {
  const continuousRef = useRef(heading ?? 0);

  if (heading != null) {
    const currentNormalized = normalizeDegrees(continuousRef.current) ?? 0;
    continuousRef.current += shortestDegreeDelta(currentNormalized, heading);
  }

  return continuousRef.current;
}

function getLevelState(beta, gamma) {
  const threshold = 0.5;
  const betaLevel = typeof beta === "number" && Math.abs(beta) <= threshold;
  const gammaLevel = typeof gamma === "number" && Math.abs(gamma) <= threshold;

  if (betaLevel && gammaLevel) return "exact";
  if (betaLevel || gammaLevel) return "partial";
  return "off";
}

function locationToLngLat(location) {
  if (
    typeof location?.latitude === "number" &&
    typeof location?.longitude === "number"
  ) {
    return [location.longitude, location.latitude];
  }
  return FALLBACK_COORDS;
}

function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);

  return new Promise((resolve, reject) => {
    let link = document.getElementById(MAPLIBRE_STYLE_ID);
    if (!link) {
      link = document.createElement("link");
      link.id = MAPLIBRE_STYLE_ID;
      link.rel = "stylesheet";
      link.href = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;
      document.head.appendChild(link);
    }

    let script = document.getElementById(MAPLIBRE_SCRIPT_ID);
    if (!script) {
      script = document.createElement("script");
      script.id = MAPLIBRE_SCRIPT_ID;
      script.src = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`;
      script.async = true;
      script.onload = () => resolve(window.maplibregl);
      script.onerror = () => reject(new Error("MapLibre failed to load"));
      document.head.appendChild(script);
      return;
    }

    script.addEventListener("load", () => resolve(window.maplibregl), { once: true });
    script.addEventListener("error", () => reject(new Error("MapLibre failed to load")), {
      once: true,
    });
  });
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
  const continuousHeading = useContinuousHeading(heading);
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
          <div
            className="compass-dial"
            style={{ transform: `rotate(${-continuousHeading}deg)` }}
          >
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

export function MapView({ location, onClose }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [mapError, setMapError] = useState(null);
  const lngLat = locationToLngLat(location);
  const hasLocation =
    typeof location?.latitude === "number" &&
    typeof location?.longitude === "number";

  useEffect(() => {
    let cancelled = false;

    loadMapLibre()
      .then((maplibregl) => {
        if (cancelled || !containerRef.current || mapRef.current) return;

        mapRef.current = new maplibregl.Map({
          container: containerRef.current,
          style: DARK_MAP_STYLE,
          center: lngLat,
          zoom: hasLocation ? 15 : 12,
          attributionControl: false,
        });

        markerRef.current = new maplibregl.Marker({ color: "#e50914" })
          .setLngLat(lngLat)
          .addTo(mapRef.current);

        requestAnimationFrame(() => mapRef.current?.resize());
      })
      .catch((error) => {
        if (!cancelled) setMapError(error.message);
      });

    return () => {
      cancelled = true;
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    markerRef.current.setLngLat(lngLat);
    mapRef.current.easeTo({ center: lngLat, duration: 300 });
  }, [lngLat[0], lngLat[1]]);

  return (
    <main className="instrument-screen">
      <header className="instrument-header">
        <h1>My Sensor Reader</h1>
        <button
          className="instrument-close-button"
          type="button"
          onClick={onClose}
          aria-label="Close map"
        >
          X
        </button>
      </header>
      <section className="instrument-body map-body" aria-label="GPS map">
        <p className="map-readout">
          {hasLocation
            ? `${formatValue(location.latitude, 6)}, ${formatValue(location.longitude, 6)}`
            : "35.093000, 32.661000"}
        </p>
        <div className="map-widget" ref={containerRef}>
          {mapError && <p className="map-error">{mapError}</p>}
        </div>
      </section>
    </main>
  );
}
