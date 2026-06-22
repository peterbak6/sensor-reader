import { DEFAULT_PARAMS, SensorSmoother } from "./sensor-noise-reduction.js";

(async function () {
  const { useMemo, useRef, useState } = React;

  const filterParams = await loadFilterParams();

  const initialReading = {
    timestamp: null,
    secureContext: window.isSecureContext,
    permissions: {
      motion: "idle",
      orientation: "idle",
      geolocation: "idle",
    },
    motion: {
      eventCount: 0,
      lastEventAt: null,
      raw: {
        acceleration: null,
        accelerationIncludingGravity: null,
        rotationRate: null,
        interval: null,
      },
      smoothed: {
        acceleration: null,
        accelerationIncludingGravity: null,
        rotationRate: null,
        interval: null,
      },
      availability: null,
    },
    orientation: {
      eventCount: 0,
      lastEventAt: null,
      raw: {
        alpha: null,
        beta: null,
        gamma: null,
        absolute: null,
        webkitCompassHeading: null,
        webkitCompassAccuracy: null,
      },
      smoothed: {
        alpha: null,
        beta: null,
        gamma: null,
        absolute: null,
        webkitCompassHeading: null,
        webkitCompassAccuracy: null,
      },
      headingSource: null,
      availability: null,
    },
    location: {
      latitude: null,
      longitude: null,
      accuracy: null,
      altitude: null,
      altitudeAccuracy: null,
      speed: null,
      heading: null,
      timestamp: null,
    },
    filter: summarizeFilterParams(filterParams),
    support: {
      deviceMotion: "DeviceMotionEvent" in window,
      deviceOrientation: "DeviceOrientationEvent" in window,
      geolocation: "geolocation" in navigator,
      orientationAbsoluteEvent: "ondeviceorientationabsolute" in window,
    },
  };

  async function loadFilterParams() {
    try {
      const response = await fetch("./sensor-filter-params.json", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.warn("Using default sensor filter params", error);
      return DEFAULT_PARAMS;
    }
  }

  function summarizeFilterParams(params) {
    return {
      motion: {
        acceleration: pickFilterFields(params.motion?.acceleration),
        accelerationIncludingGravity: pickFilterFields(
          params.motion?.accelerationIncludingGravity,
        ),
        rotationRate: pickFilterFields(params.motion?.rotationRate),
      },
      orientation: {
        beta: pickFilterFields(params.orientation?.beta),
        gamma: pickFilterFields(params.orientation?.gamma),
        alpha: pickFilterFields(params.orientation?.alpha),
        compassHeading: pickFilterFields(params.orientation?.compassHeading),
      },
      performance: {
        minMotionSampleIntervalMs:
          params.performance?.minMotionSampleIntervalMs ?? 0,
        minOrientationSampleIntervalMs:
          params.performance?.minOrientationSampleIntervalMs ?? 0,
      },
    };
  }

  function pickFilterFields(channel) {
    if (!channel) return null;
    return {
      enabled: Boolean(channel.enabled),
      tauMs: channel.tauMs ?? null,
      deadband: channel.deadband ?? null,
      compassAccuracyTrustLimitDeg:
        channel.compassAccuracyTrustLimitDeg ?? null,
    };
  }

  function round(value, digits = 4) {
    if (typeof value !== "number" || Number.isNaN(value)) return value ?? null;
    return Number(value.toFixed(digits));
  }

  function cloneVector(vector, keys, digits = 4) {
    if (!vector) return null;
    const out = {};
    keys.forEach((key) => {
      out[key] = round(vector[key], digits);
    });
    return out;
  }

  function motionRawFromEvent(event) {
    return {
      acceleration: cloneVector(event.acceleration, ["x", "y", "z"]),
      accelerationIncludingGravity: cloneVector(
        event.accelerationIncludingGravity,
        ["x", "y", "z"],
      ),
      rotationRate: cloneVector(event.rotationRate, ["alpha", "beta", "gamma"]),
      interval: round(event.interval, 2),
    };
  }

  function orientationRawFromEvent(event) {
    return {
      alpha: round(event.alpha),
      beta: round(event.beta),
      gamma: round(event.gamma),
      absolute: Boolean(event.absolute),
      webkitCompassHeading:
        typeof event.webkitCompassHeading === "number"
          ? round(event.webkitCompassHeading)
          : null,
      webkitCompassAccuracy:
        typeof event.webkitCompassAccuracy === "number"
          ? round(event.webkitCompassAccuracy)
          : null,
    };
  }

  function formatSmoothedMotion(motion) {
    if (!motion) return null;
    return {
      acceleration: cloneVector(motion.acceleration, ["x", "y", "z"]),
      accelerationIncludingGravity: cloneVector(
        motion.accelerationIncludingGravity,
        ["x", "y", "z"],
      ),
      rotationRate: cloneVector(motion.rotationRate, [
        "alpha",
        "beta",
        "gamma",
      ]),
      interval: round(motion.interval, 2),
    };
  }

  function formatSmoothedOrientation(orientation) {
    if (!orientation) return null;
    return {
      alpha: round(orientation.alpha),
      beta: round(orientation.beta),
      gamma: round(orientation.gamma),
      absolute: Boolean(orientation.absolute),
      webkitCompassHeading: round(orientation.webkitCompassHeading),
      webkitCompassAccuracy: round(orientation.webkitCompassAccuracy),
    };
  }

  function hasNumber(value) {
    return typeof value === "number" && !Number.isNaN(value);
  }

  function getFieldState(fields) {
    const values = Object.values(fields ?? {});
    if (values.some(hasNumber)) return "available";
    if (values.some((value) => value === null)) return "reported-null";
    return "missing";
  }

  function getHeadingSource(raw) {
    if (hasNumber(raw.webkitCompassHeading)) return "webkitCompassHeading";
    if (hasNumber(raw.alpha)) return "alpha";
    return null;
  }

  function requestDevicePermission(EventType, absolute) {
    if (typeof EventType?.requestPermission !== "function") {
      return Promise.resolve("not-required");
    }

    const permissionRequest =
      absolute === undefined
        ? EventType.requestPermission()
        : EventType.requestPermission(absolute);

    return permissionRequest
      .catch((error) => {
        if (!absolute) throw error;
        return EventType.requestPermission();
      });
  }

  function formatValue(value) {
    if (value === null || value === undefined) return "null";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") return String(round(value));
    return String(value);
  }

  function PinIcon() {
    return React.createElement(
      "svg",
      {
        className: "pin-icon",
        viewBox: "0 0 24 24",
        fill: "none",
        "aria-hidden": "true",
      },
      React.createElement("path", {
        d: "M12 22s7-6.1 7-12A7 7 0 0 0 5 10c0 5.9 7 12 7 12Z",
        fill: "currentColor",
      }),
      React.createElement("circle", {
        cx: "12",
        cy: "10",
        r: "2.8",
        fill: "#ffffff",
        opacity: "0.86",
      }),
    );
  }

  function SensorTable({ title, rows }) {
    return React.createElement(
      "section",
      { className: "sensor-section" },
      React.createElement("h2", { className: "section-title" }, title),
      React.createElement(
        "div",
        { className: "sensor-table", role: "table", "aria-label": title },
        React.createElement(
          "div",
          { className: "table-row table-head", role: "row" },
          React.createElement("div", { role: "columnheader" }, "Signal"),
          React.createElement("div", { role: "columnheader" }, "Raw"),
          React.createElement("div", { role: "columnheader" }, "Smoothed"),
        ),
        rows.map((row) =>
          React.createElement(
            "div",
            { className: "table-row", role: "row", key: row.label },
            React.createElement("div", { className: "signal", role: "cell" }, row.label),
            React.createElement("div", { className: "value", role: "cell" }, formatValue(row.raw)),
            React.createElement("div", { className: "value smooth", role: "cell" }, formatValue(row.smoothed)),
          ),
        ),
      ),
    );
  }

  function App() {
    const [enabled, setEnabled] = useState(false);
    const [isEnabling, setIsEnabling] = useState(false);
    const [status, setStatus] = useState("Tap to enable");
    const [errors, setErrors] = useState([]);
    const [reading, setReading] = useState(initialReading);
    const watchIdRef = useRef(null);
    const listenersRef = useRef([]);
    const smootherRef = useRef(new SensorSmoother(filterParams));

    const addError = (message) => {
      setErrors((current) => [...current, message]);
    };

    const setPermission = (key, value) => {
      setReading((current) => ({
        ...current,
        permissions: {
          ...current.permissions,
          [key]: value,
        },
      }));
    };

    const updateReading = (patcher) => {
      setReading((current) => ({
        ...patcher(current),
        timestamp: new Date().toISOString(),
      }));
    };

    const listen = (target, eventName, handler, options) => {
      target.addEventListener(eventName, handler, options);
      listenersRef.current.push(() => {
        target.removeEventListener(eventName, handler, options);
      });
    };

    const startMotion = async () => {
      if (!("DeviceMotionEvent" in window)) {
        setPermission("motion", "unsupported");
        return;
      }

      const permission = await requestDevicePermission(window.DeviceMotionEvent);
      setPermission("motion", permission);
      if (permission !== "granted" && permission !== "not-required") return;

      listen(window, "devicemotion", (event) => {
        const raw = motionRawFromEvent(event);
        const smoothed =
          smootherRef.current.updateMotion(raw, performance.now()) ??
          smootherRef.current.getLastSmoothedMotion();
        const formattedSmoothed = formatSmoothedMotion(smoothed);

        updateReading((current) => ({
          ...current,
          motion: {
            eventCount: current.motion.eventCount + 1,
            lastEventAt: new Date().toISOString(),
            raw,
            smoothed: formattedSmoothed ?? current.motion.smoothed,
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
    };

    const startOrientation = async () => {
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

      const handleOrientation = (event) => {
        const raw = orientationRawFromEvent(event);
        const smoothed =
          smootherRef.current.updateOrientation(raw, performance.now()) ??
          smootherRef.current.getLastSmoothedOrientation();
        const formattedSmoothed = formatSmoothedOrientation(smoothed);

        updateReading((current) => ({
          ...current,
          orientation: {
            eventCount: current.orientation.eventCount + 1,
            lastEventAt: new Date().toISOString(),
            raw,
            smoothed: formattedSmoothed ?? current.orientation.smoothed,
            headingSource: getHeadingSource(raw),
            availability: {
              alpha: hasNumber(raw.alpha) ? "available" : "reported-null",
              beta: hasNumber(raw.beta) ? "available" : "reported-null",
              gamma: hasNumber(raw.gamma) ? "available" : "reported-null",
              webkitCompassHeading: hasNumber(raw.webkitCompassHeading)
                ? "available"
                : "missing",
            },
          },
        }));
      };

      listen(window, "deviceorientation", handleOrientation);
      listen(window, "deviceorientationabsolute", handleOrientation);
    };

    const startLocation = () => {
      if (!("geolocation" in navigator)) {
        setPermission("geolocation", "unsupported");
        return;
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
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 15000,
        },
      );
    };

    const enableSensors = async () => {
      setIsEnabling(true);
      setStatus("Requesting access");
      setErrors([]);
      smootherRef.current.reset();

      listenersRef.current.forEach((remove) => remove());
      listenersRef.current = [];
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }

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
      setEnabled(true);
      setStatus("Listening");
      setIsEnabling(false);
    };

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

    if (!enabled) {
      return React.createElement(
        "main",
        { className: "app" },
        React.createElement(
          "section",
          { className: "permission-screen" },
          React.createElement(
            "button",
            {
              className: "permission-button",
              type: "button",
              onClick: enableSensors,
              disabled: isEnabling,
              "aria-label": "Enable sensor and location access",
            },
            React.createElement(PinIcon),
          ),
        ),
      );
    }

    return React.createElement(
      "main",
      { className: "app" },
      React.createElement(
        "section",
        { className: "data-view" },
        React.createElement(
          "div",
          { className: "top-bar" },
          React.createElement("h1", { className: "title" }, "Sensor Reader"),
          React.createElement("span", { className: "status" }, status),
        ),
        errors.length > 0 &&
          React.createElement(
            "div",
            { className: "error-list" },
            errors.map((error) =>
              React.createElement(
                "p",
                { className: "error-message", key: error },
                error,
              ),
            ),
          ),
        React.createElement(
          "div",
          { className: "summary-grid" },
          React.createElement(
            "div",
            { className: "summary-item" },
            React.createElement("span", null, "Motion"),
            React.createElement("strong", null, reading.motion.eventCount),
          ),
          React.createElement(
            "div",
            { className: "summary-item" },
            React.createElement("span", null, "Orientation"),
            React.createElement("strong", null, reading.orientation.eventCount),
          ),
          React.createElement(
            "div",
            { className: "summary-item wide" },
            React.createElement("span", null, "GPS"),
            React.createElement(
              "strong",
              null,
              reading.location.latitude == null
                ? reading.permissions.geolocation
                : `${reading.location.latitude}, ${reading.location.longitude}`,
            ),
          ),
        ),
        React.createElement(SensorTable, {
          title: "Acceleration m/s²",
          rows: tables.acceleration,
        }),
        React.createElement(SensorTable, {
          title: "Acceleration + Gravity m/s²",
          rows: tables.gravity,
        }),
        React.createElement(SensorTable, {
          title: "Rotation Rate °/s",
          rows: tables.rotation,
        }),
        React.createElement(SensorTable, {
          title: "Orientation °",
          rows: tables.orientation,
        }),
        React.createElement(
          "details",
          { className: "debug-details" },
          React.createElement("summary", null, "Debug JSON"),
          React.createElement(
            "pre",
            { className: "json-output" },
            JSON.stringify(reading, null, 2),
          ),
        ),
      ),
    );
  }

  ReactDOM.createRoot(document.getElementById("root")).render(
    React.createElement(App),
  );
})();
