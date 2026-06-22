import React, { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_PARAMS, SensorSmoother } from "./lib/sensor-noise-reduction.js";
import { MenuIcon, PinIcon } from "./components/Icons.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import SensorTable from "./components/SensorTable.jsx";
import {
  buildFilterParamsForNoiseReduction,
  buildNoiseReductionSettings,
  getFieldState,
  getHeadingSource,
  getNoiseProfile,
  getProcessingIntervalMs,
  initialReadingFor,
  motionRawFromEvent,
  orientationRawFromEvent,
  round,
  formatSmoothedMotion,
  formatSmoothedOrientation,
  requestDevicePermission,
} from "./lib/sensor-utils.js";

const DEFAULT_NOISE_REDUCTION = 55;
const DEFAULT_DISPLAY_FPS = 4;
const DEFAULT_DISPLAY_DIGITS = 3;
const DEFAULT_PROCESSING_MODE = "native";

export default function App() {
  const [started, setStarted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [filterParams, setFilterParams] = useState(DEFAULT_PARAMS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [status, setStatus] = useState("Starting");
  const [errors, setErrors] = useState([]);
  const [noiseReduction, setNoiseReduction] = useState(DEFAULT_NOISE_REDUCTION);
  const [displayFps, setDisplayFps] = useState(DEFAULT_DISPLAY_FPS);
  const [displayDigits, setDisplayDigits] = useState(DEFAULT_DISPLAY_DIGITS);
  const [processingMode, setProcessingMode] = useState(DEFAULT_PROCESSING_MODE);
  const [wakeLock, setWakeLock] = useState({
    supported: "wakeLock" in navigator,
    active: false,
    desired: false,
    status: "inactive",
    error: null,
  });
  const [reading, setReading] = useState(() =>
    initialReadingFor(DEFAULT_PARAMS, DEFAULT_NOISE_REDUCTION),
  );

  const watchIdRef = useRef(null);
  const listenersRef = useRef([]);
  const motionListeningRef = useRef(false);
  const orientationListeningRef = useRef(false);
  const wakeLockRef = useRef(null);
  const wakeLockDesiredRef = useRef(false);
  const smootherRef = useRef(
    new SensorSmoother(
      buildFilterParamsForNoiseReduction(DEFAULT_PARAMS, DEFAULT_NOISE_REDUCTION),
    ),
  );
  const displayRef = useRef({
    motion: 0,
    orientation: 0,
    eventCounts: { motion: 0, orientation: 0 },
    updateMs: Math.round(1000 / DEFAULT_DISPLAY_FPS),
  });

  const noiseProfile = useMemo(
    () => getNoiseProfile(noiseReduction),
    [noiseReduction],
  );

  const tables = useMemo(() => {
    const motion = reading.motion;
    const orientation = reading.orientation;

    return {
      acceleration: [
        ["x", motion.raw.acceleration?.x, motion.smoothed.acceleration?.x],
        ["y", motion.raw.acceleration?.y, motion.smoothed.acceleration?.y],
        ["z", motion.raw.acceleration?.z, motion.smoothed.acceleration?.z],
      ].map(([label, raw, smoothed]) => ({ label, raw, smoothed })),
      gravity: [
        [
          "x",
          motion.raw.accelerationIncludingGravity?.x,
          motion.smoothed.accelerationIncludingGravity?.x,
        ],
        [
          "y",
          motion.raw.accelerationIncludingGravity?.y,
          motion.smoothed.accelerationIncludingGravity?.y,
        ],
        [
          "z",
          motion.raw.accelerationIncludingGravity?.z,
          motion.smoothed.accelerationIncludingGravity?.z,
        ],
      ].map(([label, raw, smoothed]) => ({ label, raw, smoothed })),
      rotation: [
        [
          "alpha",
          motion.raw.rotationRate?.alpha,
          motion.smoothed.rotationRate?.alpha,
        ],
        ["beta", motion.raw.rotationRate?.beta, motion.smoothed.rotationRate?.beta],
        [
          "gamma",
          motion.raw.rotationRate?.gamma,
          motion.smoothed.rotationRate?.gamma,
        ],
      ].map(([label, raw, smoothed]) => ({ label, raw, smoothed })),
      orientation: [
        ["alpha", orientation.raw.alpha, orientation.smoothed.alpha],
        ["beta", orientation.raw.beta, orientation.smoothed.beta],
        ["gamma", orientation.raw.gamma, orientation.smoothed.gamma],
        [
          "compass",
          orientation.raw.webkitCompassHeading,
          orientation.smoothed.webkitCompassHeading,
        ],
        [
          "compass accuracy",
          orientation.raw.webkitCompassAccuracy,
          orientation.smoothed.webkitCompassAccuracy,
        ],
      ].map(([label, raw, smoothed]) => ({ label, raw, smoothed })),
    };
  }, [reading.motion, reading.orientation]);

  useEffect(() => {
    let cancelled = false;

    async function loadFilterParams() {
      try {
        const response = await fetch("/sensor-filter-params.json", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const params = await response.json();
        if (cancelled) return;
        setFilterParams(params);
        smootherRef.current.setParams(
          buildFilterParamsForNoiseReduction(params, noiseReduction, processingMode),
        );
        setReading((current) => ({
          ...current,
          filter: buildNoiseReductionSettings(params, noiseReduction),
        }));
      } catch (error) {
        console.warn("Using default sensor filter params", error);
      }
    }

    loadFilterParams();
    return () => {
      cancelled = true;
    };
  }, []);

  function addError(message) {
    setErrors((current) => [...current, message]);
  }

  function clearErrorsFor(prefix) {
    setErrors((current) =>
      current.filter((message) => !message.startsWith(`${prefix}:`)),
    );
  }

  function setPermission(key, value) {
    setReading((current) => ({
      ...current,
      permissions: { ...current.permissions, [key]: value },
    }));
  }

  function updateReading(patcher) {
    setReading((current) => ({
      ...patcher(current),
      timestamp: new Date().toISOString(),
    }));
  }

  function listen(target, eventName, handler, options) {
    target.addEventListener(eventName, handler, options);
    listenersRef.current.push(() => {
      target.removeEventListener(eventName, handler, options);
    });
  }

  function shouldUpdateDisplay(key, now) {
    if (now - displayRef.current[key] < displayRef.current.updateMs) return false;
    displayRef.current[key] = now;
    return true;
  }

  function updateNoiseReduction(level) {
    const nextLevel = Math.min(100, Math.max(0, Number(level)));
    const nextParams = buildFilterParamsForNoiseReduction(
      filterParams,
      nextLevel,
      processingMode,
    );

    setNoiseReduction(nextLevel);
    smootherRef.current.setParams(nextParams);
    setReading((current) => ({
      ...current,
      filter: buildNoiseReductionSettings(filterParams, nextLevel),
      timestamp: new Date().toISOString(),
    }));
  }

  function updateDisplayFps(fps) {
    const nextFps = Math.max(1, Number(fps));
    setDisplayFps(nextFps);
    displayRef.current.updateMs = Math.round(1000 / nextFps);
  }

  function updateDisplayDigits(digits) {
    setDisplayDigits(Math.max(1, Math.min(4, Number(digits))));
  }

  function updateProcessingMode(mode) {
    setProcessingMode(mode);
    const nextParams = buildFilterParamsForNoiseReduction(
      filterParams,
      noiseReduction,
      mode,
    );
    smootherRef.current.setParams(nextParams);
    setReading((current) => ({
      ...current,
      filter: buildNoiseReductionSettings(filterParams, noiseReduction),
      performance: {
        processingMode: mode,
        minSampleIntervalMs: getProcessingIntervalMs(mode),
      },
      timestamp: new Date().toISOString(),
    }));
  }

  function updateWakeLockReading(nextWakeLock) {
    setReading((current) => ({
      ...current,
      wakeLock: {
        supported: nextWakeLock.supported,
        active: nextWakeLock.active,
        desired: nextWakeLock.desired,
        status: nextWakeLock.status,
        error: nextWakeLock.error,
      },
      timestamp: new Date().toISOString(),
    }));
  }

  function setWakeLockState(patch) {
    setWakeLock((current) => {
      const next = { ...current, ...patch };
      wakeLockDesiredRef.current = next.desired;
      updateWakeLockReading(next);
      return next;
    });
  }

  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) {
      setWakeLockState({
        supported: false,
        active: false,
        desired: false,
        status: "unsupported",
        error: "Screen Wake Lock API is not available in this browser.",
      });
      return;
    }

    try {
      if (wakeLockRef.current) {
        setWakeLockState({
          supported: true,
          active: true,
          desired: true,
          status: "active",
          error: null,
        });
        return;
      }

      const lock = await navigator.wakeLock.request("screen");
      wakeLockRef.current = lock;
      lock.addEventListener("release", () => {
        wakeLockRef.current = null;
        setWakeLockState({ active: false, status: "inactive" });
      });
      setWakeLockState({
        supported: true,
        active: true,
        desired: true,
        status: "active",
        error: null,
      });
    } catch (error) {
      wakeLockRef.current = null;
      setWakeLockState({
        supported: true,
        active: false,
        desired: false,
        status: "error",
        error: error.message,
      });
      addError(`Wake Lock: ${error.message}`);
    }
  }

  async function releaseWakeLock() {
    wakeLockDesiredRef.current = false;
    const lock = wakeLockRef.current;
    wakeLockRef.current = null;
    if (lock) {
      try {
        await lock.release();
      } catch (error) {
        addError(`Wake Lock release: ${error.message}`);
      }
    }
    setWakeLockState({
      active: false,
      desired: false,
      status: "inactive",
      error: null,
    });
  }

  function toggleWakeLock() {
    if (wakeLockRef.current || wakeLock.active) {
      releaseWakeLock();
    } else {
      requestWakeLock();
    }
  }

  async function startMotion() {
    if (!("DeviceMotionEvent" in window)) {
      setPermission("motion", "unsupported");
      return;
    }

    const permission = await requestDevicePermission(window.DeviceMotionEvent);
    setPermission("motion", permission);
    if (permission !== "granted" && permission !== "not-required") return;
    if (motionListeningRef.current) return;

    listen(window, "devicemotion", (event) => {
      displayRef.current.eventCounts.motion += 1;
      const now = performance.now();
      const raw = motionRawFromEvent(event);
      const smoothed =
        smootherRef.current.updateMotion(raw, now) ??
        smootherRef.current.getLastSmoothedMotion();
      if (!shouldUpdateDisplay("motion", now)) return;

      updateReading((current) => ({
        ...current,
        motion: {
          eventCount: displayRef.current.eventCounts.motion,
          lastEventAt: new Date().toISOString(),
          raw,
          smoothed: formatSmoothedMotion(smoothed) ?? current.motion.smoothed,
          availability: {
            acceleration: getFieldState(raw.acceleration),
            accelerationIncludingGravity: getFieldState(
              raw.accelerationIncludingGravity,
            ),
            rotationRate: getFieldState(raw.rotationRate),
          },
        },
      }));
    });
    motionListeningRef.current = true;
  }

  async function startOrientation() {
    if (!("DeviceOrientationEvent" in window)) {
      setPermission("orientation", "unsupported");
      return;
    }

    const permission = await requestDevicePermission(
      window.DeviceOrientationEvent,
      true,
    );
    setPermission("orientation", permission);
    if (permission !== "granted" && permission !== "not-required") return;
    if (orientationListeningRef.current) return;

    const handleOrientation = (event) => {
      displayRef.current.eventCounts.orientation += 1;
      const now = performance.now();
      const raw = orientationRawFromEvent(event);
      const smoothed =
        smootherRef.current.updateOrientation(raw, now) ??
        smootherRef.current.getLastSmoothedOrientation();
      if (!shouldUpdateDisplay("orientation", now)) return;

      updateReading((current) => ({
        ...current,
        orientation: {
          eventCount: displayRef.current.eventCounts.orientation,
          lastEventAt: new Date().toISOString(),
          raw,
          smoothed: formatSmoothedOrientation(smoothed) ?? current.orientation.smoothed,
          headingSource: getHeadingSource(raw),
          availability: {
            alpha: raw.alpha == null ? "reported-null" : "available",
            beta: raw.beta == null ? "reported-null" : "available",
            gamma: raw.gamma == null ? "reported-null" : "available",
            webkitCompassHeading:
              raw.webkitCompassHeading == null ? "missing" : "available",
          },
        },
      }));
    };

    listen(window, "deviceorientation", handleOrientation);
    listen(window, "deviceorientationabsolute", handleOrientation);
    orientationListeningRef.current = true;
  }

  function startLocation() {
    if (!("geolocation" in navigator)) {
      setPermission("geolocation", "unsupported");
      return;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setPermission("geolocation", "prompt");
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setPermission("geolocation", "granted");
        updateReading((current) => ({
          ...current,
          location: {
            latitude: round(position.coords.latitude, 6),
            longitude: round(position.coords.longitude, 6),
            accuracy: round(position.coords.accuracy, 2),
            altitude: round(position.coords.altitude, 2),
            altitudeAccuracy: round(position.coords.altitudeAccuracy, 2),
            speed: round(position.coords.speed, 3),
            heading: round(position.coords.heading, 3),
            timestamp: new Date(position.timestamp).toISOString(),
          },
        }));
      },
      (error) => {
        setPermission("geolocation", "denied-or-unavailable");
        addError(`Geolocation: ${error.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }

  async function enableMotionOnly() {
    clearErrorsFor("Motion");
    setStatus("Requesting motion");
    try {
      await startMotion();
      setStatus("Listening");
    } catch (error) {
      setPermission("motion", "error");
      addError(`Motion: ${error.message}`);
      setStatus("Motion error");
    }
  }

  async function enableOrientationOnly() {
    clearErrorsFor("Orientation");
    setStatus("Requesting orientation");
    try {
      await startOrientation();
      setStatus("Listening");
    } catch (error) {
      setPermission("orientation", "error");
      addError(`Orientation: ${error.message}`);
      setStatus("Orientation error");
    }
  }

  function enableLocationOnly() {
    clearErrorsFor("Geolocation");
    setStatus("Requesting location");
    startLocation();
  }

  async function enableSensors() {
    setIsStarting(true);
    setStatus("Requesting access");
    setErrors([]);
    smootherRef.current.reset();
    displayRef.current.motion = 0;
    displayRef.current.orientation = 0;
    displayRef.current.eventCounts.motion = 0;
    displayRef.current.eventCounts.orientation = 0;

    listenersRef.current.forEach((remove) => remove());
    listenersRef.current = [];
    motionListeningRef.current = false;
    orientationListeningRef.current = false;
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    await requestWakeLock();

    try {
      await startMotion();
    } catch (error) {
      setPermission("motion", "error");
      addError(`Motion: ${error.message}`);
    }

    try {
      await startOrientation();
    } catch (error) {
      setPermission("orientation", "error");
      addError(`Orientation: ${error.message}`);
    }

    startLocation();
    listen(document, "visibilitychange", () => {
      if (
        document.visibilityState === "visible" &&
        wakeLockDesiredRef.current &&
        !wakeLockRef.current
      ) {
        requestWakeLock();
      }
    });
    setStatus("Listening");
    setStarted(true);
    setIsStarting(false);
  }

  if (!started) {
    return (
      <main className="app permission-app">
        <section className="permission-screen">
          <button
            className="permission-button"
            type="button"
            onClick={enableSensors}
            disabled={isStarting}
            aria-label="Enable sensor, location, and wake lock access"
          >
            <PinIcon />
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <header className="app-header">
        <h1 className="app-title">My Sensor Reader</h1>
        <button
          className="menu-button"
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Open settings"
        >
          <MenuIcon />
        </button>
      </header>

      <SettingsModal
        open={settingsOpen}
        permissions={reading.permissions}
        wakeLock={wakeLock}
        noiseReduction={noiseReduction}
        noiseProfile={noiseProfile}
        displayFps={displayFps}
        displayDigits={displayDigits}
        processingMode={processingMode}
        status={status}
        onNoiseChange={updateNoiseReduction}
        onDisplayFpsChange={updateDisplayFps}
        onDisplayDigitsChange={updateDisplayDigits}
        onProcessingModeChange={updateProcessingMode}
        onEnableMotion={enableMotionOnly}
        onEnableOrientation={enableOrientationOnly}
        onEnableLocation={enableLocationOnly}
        onToggleWakeLock={toggleWakeLock}
        onClose={() => setSettingsOpen(false)}
      />

      <section className="data-view">
        {errors.length > 0 && (
          <div className="error-list">
            {errors.map((error) => (
              <p className="error-message" key={error}>
                {error}
              </p>
            ))}
          </div>
        )}

        <div className="summary-grid">
          <div className="summary-item">
            <span>Motion</span>
            <strong>{reading.motion.eventCount}</strong>
          </div>
          <div className="summary-item">
            <span>Orientation</span>
            <strong>{reading.orientation.eventCount}</strong>
          </div>
          <div className="summary-item wide">
            <span>GPS</span>
            <strong>
              {reading.location.latitude == null
                ? reading.permissions.geolocation
                : `${reading.location.latitude}, ${reading.location.longitude}`}
            </strong>
          </div>
        </div>

        <SensorTable title="Acceleration m/s²" rows={tables.acceleration} digits={displayDigits} />
        <SensorTable title="Acceleration + Gravity m/s²" rows={tables.gravity} digits={displayDigits} />
        <SensorTable title="Rotation Rate °/s" rows={tables.rotation} digits={displayDigits} />
        <SensorTable title="Orientation °" rows={tables.orientation} digits={displayDigits} />

        <details className="debug-details">
          <summary>Debug JSON</summary>
          <pre className="json-output">{JSON.stringify(reading, null, 2)}</pre>
        </details>
      </section>
    </main>
  );
}
