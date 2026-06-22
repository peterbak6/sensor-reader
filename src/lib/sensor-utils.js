export function round(value, digits = 4) {
  if (typeof value !== "number" || Number.isNaN(value)) return value ?? null;
  return Number(value.toFixed(digits));
}

export function formatValue(value, digits = 3) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(round(value, digits));
  return String(value);
}

export function pickFilterFields(channel) {
  if (!channel) return null;
  return {
    enabled: Boolean(channel.enabled),
    tauMs: channel.tauMs ?? null,
    deadband: channel.deadband ?? null,
    compassAccuracyTrustLimitDeg: channel.compassAccuracyTrustLimitDeg ?? null,
  };
}

export function summarizeFilterParams(params) {
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

export function scaleChannel(channel, tauScale, deadbandScale) {
  if (!channel) return channel;
  return {
    ...channel,
    tauMs:
      typeof channel.tauMs === "number"
        ? Math.round(channel.tauMs * tauScale)
        : channel.tauMs,
    deadband:
      typeof channel.deadband === "number"
        ? round(channel.deadband * deadbandScale, 4)
        : channel.deadband,
  };
}

export function getNoiseProfile(level) {
  const amount = Math.min(100, Math.max(0, Number(level))) / 100;
  const tauScale =
    amount <= 0.35
      ? 0.35 + (amount / 0.35) * 0.65
      : 1 + ((amount - 0.35) / 0.65) * 5;
  const deadbandScale =
    amount <= 0.35
      ? 0.5 + (amount / 0.35) * 0.5
      : 1 + ((amount - 0.35) / 0.65) * 3;
  const displayUpdateMs = Math.round(70 + amount * 330);

  return {
    level: Math.round(amount * 100),
    label:
      amount < 0.25
        ? "Responsive"
        : amount < 0.58
          ? "Balanced"
          : amount < 0.82
            ? "Stable"
            : "Very stable",
    tauScale: round(tauScale, 2),
    deadbandScale: round(deadbandScale, 2),
    displayUpdateMs,
  };
}

export function getRefreshLabel(profile) {
  const fps = Math.max(1, Math.round(1000 / profile.displayUpdateMs));
  return `${fps}fps / ${profile.displayUpdateMs}ms`;
}

export function getDisplayRefreshLabel(fps) {
  const displayFps = Math.max(1, Number(fps));
  return `${displayFps}fps / ${Math.round(1000 / displayFps)}ms`;
}

export function getProcessingIntervalMs(mode) {
  if (mode === "balanced") return 33;
  if (mode === "saver") return 100;
  return 0;
}

export function buildFilterParamsForNoiseReduction(baseParams, level, processingMode = "native") {
  const profile = getNoiseProfile(level);
  const sampleInterval = getProcessingIntervalMs(processingMode);
  return {
    motion: {
      acceleration: scaleChannel(
        baseParams.motion?.acceleration,
        profile.tauScale,
        profile.deadbandScale,
      ),
      accelerationIncludingGravity: scaleChannel(
        baseParams.motion?.accelerationIncludingGravity,
        profile.tauScale,
        1,
      ),
      rotationRate: scaleChannel(
        baseParams.motion?.rotationRate,
        profile.tauScale,
        profile.deadbandScale,
      ),
    },
    orientation: {
      beta: scaleChannel(baseParams.orientation?.beta, profile.tauScale, 1),
      gamma: scaleChannel(baseParams.orientation?.gamma, profile.tauScale, 1),
      alpha: scaleChannel(baseParams.orientation?.alpha, profile.tauScale, 1),
      compassHeading: scaleChannel(
        baseParams.orientation?.compassHeading,
        profile.tauScale,
        1,
      ),
    },
    performance: {
      ...(baseParams.performance ?? {}),
      minMotionSampleIntervalMs: sampleInterval,
      minOrientationSampleIntervalMs: sampleInterval,
    },
  };
}

export function buildNoiseReductionSettings(baseParams, level) {
  const profile = getNoiseProfile(level);
  const params = buildFilterParamsForNoiseReduction(baseParams, level);
  return {
    noiseReduction: profile,
    params: summarizeFilterParams(params),
  };
}

export function initialReadingFor(filterParams, noiseReduction) {
  return {
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
    wakeLock: {
      supported: "wakeLock" in navigator,
      active: false,
      desired: false,
      status: "inactive",
      error: null,
    },
    filter: buildNoiseReductionSettings(filterParams, noiseReduction),
    support: {
      deviceMotion: "DeviceMotionEvent" in window,
      deviceOrientation: "DeviceOrientationEvent" in window,
      geolocation: "geolocation" in navigator,
      orientationAbsoluteEvent: "ondeviceorientationabsolute" in window,
      wakeLock: "wakeLock" in navigator,
    },
  };
}

function cloneVector(vector, keys, digits = 4) {
  if (!vector) return null;
  const out = {};
  keys.forEach((key) => {
    out[key] = round(vector[key], digits);
  });
  return out;
}

export function motionRawFromEvent(event) {
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

export function orientationRawFromEvent(event) {
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

export function formatSmoothedMotion(motion) {
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

export function formatSmoothedOrientation(orientation) {
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

export function getFieldState(fields) {
  const values = Object.values(fields ?? {});
  if (values.some(hasNumber)) return "available";
  if (values.some((value) => value === null)) return "reported-null";
  return "missing";
}

export function getHeadingSource(raw) {
  if (hasNumber(raw.webkitCompassHeading)) return "webkitCompassHeading";
  if (hasNumber(raw.alpha)) return "alpha";
  return null;
}

export function getPermissionTone(value) {
  if (value === "granted" || value === "not-required" || value === "active") {
    return "good";
  }
  if (value === "idle" || value === "prompt" || value === "inactive") {
    return "warn";
  }
  return "bad";
}

export function requestDevicePermission(EventType, absolute) {
  if (typeof EventType?.requestPermission !== "function") {
    return Promise.resolve("not-required");
  }

  const permissionRequest =
    absolute === undefined
      ? EventType.requestPermission()
      : EventType.requestPermission(absolute);

  return permissionRequest.catch((error) => {
    if (!absolute) throw error;
    return EventType.requestPermission();
  });
}
