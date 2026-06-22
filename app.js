(function () {
  const { useMemo, useRef, useState } = React;

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
      acceleration: null,
      accelerationIncludingGravity: null,
      rotationRate: null,
      interval: null,
      raw: null,
    },
    orientation: {
      eventCount: 0,
      lastEventAt: null,
      alpha: null,
      beta: null,
      gamma: null,
      absolute: null,
      compassHeading: null,
      compassAccuracy: null,
      headingSource: null,
      raw: null,
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
    support: {
      deviceMotion: "DeviceMotionEvent" in window,
      deviceOrientation: "DeviceOrientationEvent" in window,
      geolocation: "geolocation" in navigator,
      orientationAbsoluteEvent: "ondeviceorientationabsolute" in window,
    },
  };

  function round(value, digits = 6) {
    if (typeof value !== "number" || Number.isNaN(value)) return value ?? null;
    return Number(value.toFixed(digits));
  }

  function vectorToJson(vector, digits = 4) {
    if (!vector) return null;

    return {
      x: round(vector.x, digits),
      y: round(vector.y, digits),
      z: round(vector.z, digits),
    };
  }

  function rotationToJson(rotation) {
    if (!rotation) return null;

    return {
      alpha: round(rotation.alpha, 4),
      beta: round(rotation.beta, 4),
      gamma: round(rotation.gamma, 4),
    };
  }

  function hasNumber(value) {
    return typeof value === "number" && !Number.isNaN(value);
  }

  function getFieldState(fields) {
    const values = Object.values(fields);
    if (values.some(hasNumber)) return "available";
    if (values.some((value) => value === null)) return "reported-null";
    return "missing";
  }

  function getIosCompassHeading(event) {
    if (typeof event.webkitCompassHeading === "number") {
      return round(event.webkitCompassHeading, 4);
    }

    return null;
  }

  function getFallbackHeading(event) {
    if (typeof event.alpha !== "number") return null;
    return round(360 - event.alpha, 4);
  }

  async function requestDevicePermission(EventType, absolute) {
    if (typeof EventType?.requestPermission !== "function") {
      return "not-required";
    }

    try {
      const permission = absolute
        ? await EventType.requestPermission(true)
        : await EventType.requestPermission();
      return permission;
    } catch (error) {
      if (!absolute) throw error;
      return EventType.requestPermission();
    }
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

  function App() {
    const [enabled, setEnabled] = useState(false);
    const [isEnabling, setIsEnabling] = useState(false);
    const [status, setStatus] = useState("Tap to enable");
    const [errors, setErrors] = useState([]);
    const [reading, setReading] = useState(initialReading);
    const watchIdRef = useRef(null);
    const listenersRef = useRef([]);

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
        const acceleration = vectorToJson(event.acceleration);
        const accelerationIncludingGravity = vectorToJson(
          event.accelerationIncludingGravity,
        );
        const rotationRate = rotationToJson(event.rotationRate);

        updateReading((current) => ({
          ...current,
          motion: {
            eventCount: current.motion.eventCount + 1,
            lastEventAt: new Date().toISOString(),
            acceleration,
            accelerationIncludingGravity,
            rotationRate,
            interval: round(event.interval, 2),
            raw: {
              accelerationState: getFieldState(acceleration ?? {}),
              accelerationIncludingGravityState: getFieldState(
                accelerationIncludingGravity ?? {},
              ),
              rotationRateState: getFieldState(rotationRate ?? {}),
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

      const handleOrientation = (event, source) => {
        const iosHeading = getIosCompassHeading(event);
        const fallbackHeading = getFallbackHeading(event);

        updateReading((current) => ({
          ...current,
          orientation: {
            eventCount: current.orientation.eventCount + 1,
            lastEventAt: new Date().toISOString(),
            alpha: round(event.alpha, 4),
            beta: round(event.beta, 4),
            gamma: round(event.gamma, 4),
            absolute: Boolean(event.absolute),
            compassHeading: iosHeading ?? fallbackHeading,
            compassAccuracy:
              typeof event.webkitCompassAccuracy === "number"
                ? round(event.webkitCompassAccuracy, 4)
                : null,
            headingSource:
              iosHeading !== null
                ? "webkitCompassHeading"
                : fallbackHeading !== null
                  ? source
                  : null,
            raw: {
              eventType: event.type,
              alphaState: hasNumber(event.alpha) ? "available" : "reported-null",
              betaState: hasNumber(event.beta) ? "available" : "reported-null",
              gammaState: hasNumber(event.gamma) ? "available" : "reported-null",
              hasWebkitCompassHeading: hasNumber(event.webkitCompassHeading),
              hasWebkitCompassAccuracy: hasNumber(event.webkitCompassAccuracy),
            },
          },
        }));
      };

      listen(window, "deviceorientation", (event) => {
        handleOrientation(event, "deviceorientation.alpha");
      });

      listen(window, "deviceorientationabsolute", (event) => {
        handleOrientation(event, "deviceorientationabsolute.alpha");
      });
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
              latitude: round(position.coords.latitude),
              longitude: round(position.coords.longitude),
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

    const json = useMemo(() => JSON.stringify(reading, null, 2), [reading]);

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
          React.createElement("h1", { className: "title" }, "Sensor JSON"),
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
        React.createElement("pre", { className: "json-output" }, json),
      ),
    );
  }

  ReactDOM.createRoot(document.getElementById("root")).render(
    React.createElement(App),
  );
})();
