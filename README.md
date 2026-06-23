# Sensor Reader

Mobile-first React/Vite app for reading browser sensor APIs, smoothing noisy values, and displaying raw/smoothed data plus focused instrument widgets.

## 1. Install

```bash
npm install
npm run dev -- --port 5174
```

Production build:

```bash
npm run build
```

Sensor access requires a secure context. Use `localhost`, HTTPS, or a hosted URL such as Cloudflare Pages. On iPhone, Motion/Orientation permissions must be requested from a direct user tap; the app provides both the main start button and per-sensor enable buttons in Settings.

## 2. Sensors

The app reads:

- `DeviceMotionEvent`: acceleration, acceleration including gravity, rotation rate.
- `DeviceOrientationEvent`: alpha, beta, gamma, absolute orientation.
- iOS compass fields when available: `webkitCompassHeading`, `webkitCompassAccuracy`.
- `navigator.geolocation.watchPosition`: latitude, longitude, accuracy, altitude, speed, heading.
- `navigator.wakeLock`: optional screen wake lock.

## 3. Data Processing Pipeline

Methods:

- Time-based EMA: smooths scalar and vector signals with `alpha = 1 - exp(-dt / tauMs)`. This reduces sensor noise while keeping behavior consistent across changing browser event rates. Used for acceleration, gravity, rotation rate, beta, and gamma.
- Circular EMA: smooths angles by converting degrees to a unit vector, filtering `x/y`, then converting back to degrees. This avoids false jumps near `0/360`. Used for compass heading and alpha/yaw-like orientation.
- Soft deadband: suppresses tiny values around zero but leaves larger values continuous. This removes idle jitter and gyro/acceleration noise without a visible snap at the threshold. Used for linear acceleration and rotation rate.
- Compass accuracy gate: ignores `webkitCompassHeading` samples when iOS reports poor accuracy. This prevents bad magnetometer samples from polluting the circular EMA. The current trust limit is `35°`.
- Sample throttling: optionally drops samples before filtering when they arrive faster than the selected processing mode. This reduces CPU/GC cost when battery saving matters.
- Display throttling: limits table redraw frequency independently from sensor processing. Tables stay readable and cheaper to render; compass and level widgets bypass this while open for native-speed feedback.

Base filter params:

| Signal | Method | `tauMs` | Deadband / extra |
| --- | --- | ---: | --- |
| Linear acceleration `x/y/z` | EMA vector | `50` | `0.04 m/s²` |
| Acceleration + gravity `x/y/z` | EMA vector | `300` | none |
| Rotation rate `alpha/beta/gamma` | EMA vector | `39` | `0.75 °/s` |
| Orientation `beta` | EMA scalar | `180` | none |
| Orientation `gamma` | EMA scalar | `180` | none |
| Orientation `alpha` | circular EMA | `150` | no deadband |
| `webkitCompassHeading` | circular EMA | `150` | ignore iOS samples with accuracy `>= 35°` |

Runtime tuning:

- Noise reduction slider scales `tauMs` and selected deadbands.
- Lower noise reduction = more responsive, noisier.
- Higher noise reduction = smoother, more lag.
- Processing modes: `native` processes every sample, `balanced` caps processing at about `30 Hz`, `saver` caps at about `10 Hz`.

Runtime controls:

- Noise reduction level.
- Display refresh rate.
- Decimal precision.
- Sensor processing mode: native, balanced, saver.

## 4. Widgets

Widgets open from small action buttons in the relevant sections:

- Compass: opens from `Orientation`; uses smoothed compass heading, falling back to alpha. Heading is unwrapped across `0/360` to avoid full-circle jumps.
- Level: opens from `Rotation Rate`; uses smoothed beta/gamma at native speed. Bubble color: green when both axes are level, yellow when one axis is level, red otherwise.
- Map: opens from `GPS`; uses MapLibre loaded from CDN at runtime, live GPS when available, and a Yokne'am fallback coordinate.
