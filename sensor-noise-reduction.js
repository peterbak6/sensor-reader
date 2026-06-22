/**
 * sensor-noise-reduction.js
 * ----------------------------------------------------------------------
 * Layer 2 of the sensor pipeline: RAW -> SMOOTHED -> (later) DERIVED.
 *
 * This file only does smoothing. It takes the same plain-object shapes you
 * get from `devicemotion` / `deviceorientation` events and returns a
 * noise-reduced version with an IDENTICAL shape - same keys, same units, no
 * new computed fields (no tilt, no step count, no speed/bearing). That
 * comes later, as its own derived-attributes layer, built on TOP of the
 * smoothed values this file produces.
 *
 * Design goals (in priority order, per project requirements):
 *   1. Keep the raw layer separately - this module never mutates or
 *      discards the raw sample you pass in; it only reads from it.
 *   2. Battery-conscious:
 *        - No internal timers/intervals. Nothing runs unless you call
 *          updateMotion()/updateOrientation() yourself, in response to a
 *          real sensor event. No background CPU usage.
 *        - A disabled channel (`enabled: false` in the params file) is NOT
 *          dropped from the output - it's passed through unfiltered, with
 *          zero allocation and zero math. This lets you turn off filtering
 *          for attributes you don't use without losing them from the
 *          smoothed object's shape.
 *        - Optional `minMotionSampleIntervalMs` / `minOrientationSampleIntervalMs`
 *          throttle: drop samples that arrive faster than you need, before
 *          any filter math runs.
 *        - No DOM/browser dependency. Pure functions + one small class,
 *          easy to unit test in Node, no extra dependencies.
 *      NOTE: the dominant battery cost on a phone is almost always sensor
 *      ACQUISITION (geolocation accuracy/frequency, keeping motion listeners
 *      attached at all), not the smoothing math here. This module helps at
 *      the margins (CPU/GC); the bigger lever is upstream of it.
 *   3. Time-constant based smoothing (`tauMs`) instead of a fixed EMA alpha,
 *      so behaviour stays consistent even when the real sensor sample rate
 *      drifts (60Hz typical, but can drop under throttling/battery saver).
 *      alpha is derived per-sample from tau and the actual elapsed time:
 *          alpha = 1 - exp(-dt / tau)
 *
 * Usage:
 *   import { SensorSmoother } from "./sensor-noise-reduction.js";
 *   import defaultParams from "./sensor-filter-params.json" assert { type: "json" };
 *
 *   const smoother = new SensorSmoother(defaultParams);
 *
 *   window.addEventListener("devicemotion", (e) => {
 *     const rawMotion = {
 *       acceleration: e.acceleration,
 *       accelerationIncludingGravity: e.accelerationIncludingGravity,
 *       rotationRate: e.rotationRate,
 *       interval: e.interval,
 *     };
 *     const smoothedMotion = smoother.updateMotion(rawMotion, performance.now());
 *     // smoothedMotion is `null` if this sample was throttled - keep using
 *     // smoother.getLastSmoothedMotion() in that case.
 *   });
 *
 *   window.addEventListener("deviceorientation", (e) => {
 *     const rawOrientation = {
 *       alpha: e.alpha,
 *       beta: e.beta,
 *       gamma: e.gamma,
 *       absolute: e.absolute,
 *       webkitCompassHeading: e.webkitCompassHeading,
 *       webkitCompassAccuracy: e.webkitCompassAccuracy,
 *     };
 *     const smoothedOrientation = smoother.updateOrientation(rawOrientation, performance.now());
 *   });
 *
 *   // On stop/restart, so old gravity/heading estimates don't leak into a
 *   // fresh session:
 *   smoother.reset();
 */

// ---------------------------------------------------------------------------
// Pure math helpers (exported individually for unit testing / reuse by a
// future derived-attributes layer).
// ---------------------------------------------------------------------------

/** Degrees -> radians. */
export function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/** Radians -> degrees. */
export function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

/** Wrap an angle in degrees into the [0, 360) range. */
export function normalizeAngle360(deg) {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/**
 * Convert a smoothing time constant into the EMA weight for one sample.
 *
 * Replaces a fixed `alpha` so the filter behaves the same regardless of how
 * much time actually elapsed between samples (sensor sample rates are not
 * guaranteed to be constant).
 *
 * @param {number} dtMs - milliseconds elapsed since the previous sample.
 * @param {number} tauMs - desired smoothing time constant, in milliseconds.
 *   tauMs <= 0 disables smoothing (the filter tracks the input exactly).
 * @returns {number} alpha in [0, 1] - weight given to the new sample.
 */
export function alphaFromTau(dtMs, tauMs) {
  if (!tauMs || tauMs <= 0) return 1;
  if (dtMs == null || dtMs <= 0) return 0;
  return 1 - Math.exp(-dtMs / tauMs);
}

/**
 * One step of exponential moving average on a plain number.
 * Cold start (prev == null) snaps straight to the first real sample instead
 * of easing up from zero.
 */
export function emaScalar(prev, next, alpha) {
  if (next == null) return prev ?? null;
  if (prev == null) return next;
  return prev + alpha * (next - prev);
}

/**
 * Soft / "knee" deadband: values inside +/-threshold are zeroed, values
 * outside it are shifted down by threshold rather than passed through
 * unchanged. This avoids the discontinuity a hard deadband creates right at
 * the threshold boundary (a value just above threshold doesn't suddenly
 * jump from 0 to its full magnitude).
 *
 * Applied per-component (x/y/z or alpha/beta/gamma independently), which is
 * simple and matches a single configured threshold per channel, but can
 * skew the direction of a small vector slightly. A magnitude-based deadband
 * (scale the whole vector by its norm instead) is a possible future
 * upgrade if that distortion ever matters for your use case.
 */
export function softDeadband(value, threshold) {
  if (value == null || !threshold) return value;
  const mag = Math.abs(value);
  if (mag <= threshold) return 0;
  return Math.sign(value) * (mag - threshold);
}

/**
 * One step of circular exponential smoothing on an angle (degrees).
 * Averages in unit-vector (cos/sin) space instead of on the raw angle, so
 * headings near the 0/360 wraparound don't average toward the wrong side
 * of the compass (the classic "359 and 1 average to 180" bug).
 *
 * @param {{x:number,y:number}|null} prevVec - previous smoothed unit vector, or null on cold start.
 * @param {number|null} nextDeg - new raw angle in degrees.
 * @param {number} alpha - EMA weight for the new sample.
 * @returns {{x:number,y:number}|null}
 */
export function emaCircular(prevVec, nextDeg, alpha) {
  if (nextDeg == null) return prevVec ?? null;
  const rad = toRad(nextDeg);
  const sample = { x: Math.cos(rad), y: Math.sin(rad) };
  if (!prevVec) return sample;
  return {
    x: prevVec.x + alpha * (sample.x - prevVec.x),
    y: prevVec.y + alpha * (sample.y - prevVec.y),
  };
}

/** Read a smoothed heading (degrees, 0-360) back out of its unit-vector state. */
export function angleFromVector(vec) {
  if (!vec) return null;
  return normalizeAngle360(toDeg(Math.atan2(vec.y, vec.x)));
}

// ---------------------------------------------------------------------------
// Default parameters (mirrors sensor-filter-params.json; used if the caller
// doesn't supply their own params object).
// ---------------------------------------------------------------------------

export const DEFAULT_PARAMS = {
  motion: {
    acceleration: { enabled: true, tauMs: 50, deadband: 0.04 },
    accelerationIncludingGravity: { enabled: true, tauMs: 122, deadband: 0 },
    rotationRate: { enabled: true, tauMs: 39, deadband: 0.75 },
  },
  orientation: {
    beta: { enabled: true, tauMs: 88, deadband: 0 },
    gamma: { enabled: true, tauMs: 88, deadband: 0 },
    alpha: { enabled: false, tauMs: 150 },
    compassHeading: { enabled: true, tauMs: 150, compassAccuracyTrustLimitDeg: 35 },
  },
  performance: {
    minMotionSampleIntervalMs: 0,
    minOrientationSampleIntervalMs: 0,
  },
};

/**
 * Shallow-merge a params object over the defaults. Handles two shapes:
 *   - nested groups (motion/orientation): group -> channel -> fields, merged
 *     two levels deep so e.g. `{ motion: { rotationRate: { enabled: false } } }`
 *     only touches that one channel.
 *   - flat groups (performance): group -> scalar fields, merged one level deep.
 * A group's shape is auto-detected from the default's own values, so this
 * doesn't need special-casing by name.
 */
function mergeParams(base, overrides) {
  const out = {};
  for (const group of Object.keys(base)) {
    const baseGroup = base[group];
    const overrideGroup = (overrides && overrides[group]) || {};
    const isFlat = Object.values(baseGroup).every((v) => typeof v !== "object" || v === null);
    if (isFlat) {
      out[group] = { ...baseGroup, ...overrideGroup };
    } else {
      out[group] = {};
      for (const channel of Object.keys(baseGroup)) {
        out[group][channel] = { ...baseGroup[channel], ...overrideGroup[channel] };
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// SensorSmoother
// ---------------------------------------------------------------------------

/**
 * Stateful per-channel smoother for `devicemotion` and `deviceorientation`
 * samples. Has no DOM dependency - feed it plain objects, get plain objects
 * back. Create one instance per active sensor session.
 */
export class SensorSmoother {
  /** @param {object} [params] - shape matching sensor-filter-params.json; merged over DEFAULT_PARAMS. */
  constructor(params = DEFAULT_PARAMS) {
    this._params = mergeParams(DEFAULT_PARAMS, params);
    this.reset();
  }

  /** Update tuning parameters at runtime (e.g. from a debug panel). Merges over the current params. */
  setParams(params) {
    this._params = mergeParams(this._params, params);
  }

  /**
   * Clear all internal filter state (gravity estimate, smoothed rotation
   * rate, heading vectors, throttle timers). Call this whenever sensors are
   * stopped and restarted, so stale state from a previous session doesn't
   * leak into the first few samples of the new one.
   */
  reset() {
    this._state = {
      motion: {
        acceleration: { x: null, y: null, z: null },
        accelerationIncludingGravity: { x: null, y: null, z: null },
        rotationRate: { alpha: null, beta: null, gamma: null },
        lastSampleAt: null,
      },
      orientation: {
        beta: null,
        gamma: null,
        alphaVec: null,
        headingVec: null,
        lastSampleAt: null,
      },
    };
    this._lastSmoothedMotion = null;
    this._lastSmoothedOrientation = null;
  }

  /**
   * Feed one `devicemotion` sample.
   *
   * @param {{acceleration:object|null, accelerationIncludingGravity:object|null, rotationRate:object|null, interval:number|null}} raw
   *   Plain object with the same fields as a DeviceMotionEvent (extract them
   *   yourself from the browser event - this module has no DOM dependency).
   * @param {number} timestampMs - monotonic timestamp for this sample (e.g. `performance.now()`).
   * @returns {object|null} smoothed motion object with the same shape as `raw`,
   *   or `null` if this sample was dropped by the `minMotionSampleIntervalMs` throttle.
   */
  updateMotion(raw, timestampMs) {
    const p = this._params.motion;
    const s = this._state.motion;
    const perf = this._params.performance;

    if (
      s.lastSampleAt != null &&
      perf.minMotionSampleIntervalMs > 0 &&
      timestampMs - s.lastSampleAt < perf.minMotionSampleIntervalMs
    ) {
      return null; // throttled - caller should keep using getLastSmoothedMotion()
    }

    const dtMs = s.lastSampleAt == null ? null : timestampMs - s.lastSampleAt;
    s.lastSampleAt = timestampMs;

    const out = {
      acceleration: this._filterVector(raw.acceleration, s.acceleration, p.acceleration, dtMs, ["x", "y", "z"]),
      accelerationIncludingGravity: this._filterVector(
        raw.accelerationIncludingGravity,
        s.accelerationIncludingGravity,
        p.accelerationIncludingGravity,
        dtMs,
        ["x", "y", "z"]
      ),
      rotationRate: this._filterVector(raw.rotationRate, s.rotationRate, p.rotationRate, dtMs, ["alpha", "beta", "gamma"]),
      interval: raw.interval ?? null,
    };

    this._lastSmoothedMotion = out;
    return out;
  }

  /** Shared per-component EMA + deadband filter for a 3-field vector (x/y/z or alpha/beta/gamma). */
  _filterVector(raw, state, channelParams, dtMs, keys) {
    if (!raw) return null;
    if (!channelParams.enabled) {
      // Pass-through: zero allocation, zero math, schema stays complete.
      return raw;
    }
    const alpha = dtMs == null ? 1 : alphaFromTau(dtMs, channelParams.tauMs);
    const out = {};
    for (const k of keys) {
      const smoothed = emaScalar(state[k], raw[k], alpha);
      state[k] = smoothed;
      out[k] = channelParams.deadband ? softDeadband(smoothed, channelParams.deadband) : smoothed;
    }
    return out;
  }

  /**
   * Feed one `deviceorientation` sample.
   *
   * @param {{alpha:number|null, beta:number|null, gamma:number|null, absolute:boolean, webkitCompassHeading:number|null, webkitCompassAccuracy:number|null}} raw
   * @param {number} timestampMs
   * @returns {object|null} smoothed orientation object with the same shape as `raw`,
   *   or `null` if this sample was dropped by the `minOrientationSampleIntervalMs` throttle.
   */
  updateOrientation(raw, timestampMs) {
    const p = this._params.orientation;
    const s = this._state.orientation;
    const perf = this._params.performance;

    if (
      s.lastSampleAt != null &&
      perf.minOrientationSampleIntervalMs > 0 &&
      timestampMs - s.lastSampleAt < perf.minOrientationSampleIntervalMs
    ) {
      return null;
    }

    const dtMs = s.lastSampleAt == null ? null : timestampMs - s.lastSampleAt;
    s.lastSampleAt = timestampMs;

    const out = {
      alpha: raw.alpha ?? null,
      beta: this._filterScalar(raw.beta, "beta", p.beta, dtMs, s),
      gamma: this._filterScalar(raw.gamma, "gamma", p.gamma, dtMs, s),
      absolute: !!raw.absolute,
      webkitCompassHeading: raw.webkitCompassHeading ?? null,
      webkitCompassAccuracy: raw.webkitCompassAccuracy ?? null,
    };

    // alpha wraps 0-360 like a compass heading - must use circular smoothing,
    // not the plain EMA used for beta/gamma. Off by default (see params file).
    if (p.alpha.enabled && raw.alpha != null) {
      const alpha = dtMs == null ? 1 : alphaFromTau(dtMs, p.alpha.tauMs);
      s.alphaVec = emaCircular(s.alphaVec, raw.alpha, alpha);
      out.alpha = angleFromVector(s.alphaVec);
    }

    // compass heading: circular EMA, ignoring low-confidence iOS samples.
    if (p.compassHeading.enabled && raw.webkitCompassHeading != null) {
      const trustworthy =
        raw.webkitCompassAccuracy == null || raw.webkitCompassAccuracy < p.compassHeading.compassAccuracyTrustLimitDeg;
      if (trustworthy) {
        const alpha = dtMs == null ? 1 : alphaFromTau(dtMs, p.compassHeading.tauMs);
        s.headingVec = emaCircular(s.headingVec, raw.webkitCompassHeading, alpha);
      }
      out.webkitCompassHeading = angleFromVector(s.headingVec);
    }

    this._lastSmoothedOrientation = out;
    return out;
  }

  /** Shared scalar EMA + deadband filter for a single bounded angle (beta/gamma). */
  _filterScalar(rawValue, key, channelParams, dtMs, state) {
    if (rawValue == null) return null;
    if (!channelParams.enabled) return rawValue;
    const alpha = dtMs == null ? 1 : alphaFromTau(dtMs, channelParams.tauMs);
    const smoothed = emaScalar(state[key], rawValue, alpha);
    state[key] = smoothed;
    return channelParams.deadband ? softDeadband(smoothed, channelParams.deadband) : smoothed;
  }

  /** Last value returned by updateMotion() (including when a throttled call returned null). */
  getLastSmoothedMotion() {
    return this._lastSmoothedMotion;
  }

  /** Last value returned by updateOrientation(). */
  getLastSmoothedOrientation() {
    return this._lastSmoothedOrientation;
  }
}
