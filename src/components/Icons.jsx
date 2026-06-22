import React from "react";

export function PinIcon() {
  return (
    <svg
      className="pin-icon"
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 96H22L29 75L40 116L50 96H56L60 81L64 109L70 96H80L88 71L101 117L108 96H116"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g transform="translate(20.4 0) scale(3.3)">
        <path
          d="M12 10c-1.104 0-2-.896-2-2s.896-2 2-2 2 .896 2 2-.896 2-2 2m0-5c-1.657 0-3 1.343-3 3s1.343 3 3 3 3-1.343 3-3-1.343-3-3-3m-7 2.602c0-3.517 3.271-6.602 7-6.602s7 3.085 7 6.602c0 3.455-2.563 7.543-7 14.527-4.489-7.073-7-11.072-7-14.527m7-7.602c-4.198 0-8 3.403-8 7.602 0 4.198 3.469 9.21 8 16.398 4.531-7.188 8-12.2 8-16.398 0-4.199-3.801-7.602-8-7.602Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

export function MenuIcon() {
  return (
    <svg className="menu-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6h16M4 12h16M4 18h16"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function CompassActionIcon() {
  return (
    <svg className="action-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M16.5 6.8 13.5 14 6.8 17.2 10.1 10.1 16.5 6.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function LevelActionIcon() {
  return (
    <svg className="action-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function MapActionIcon() {
  return (
    <svg className="action-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6.5 4.5 11 2.8l6.5 2.7v14l-4.5-1.8-6.5 2.8-4.5-2v-14l4.5 2Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M6.5 6.5v14M13 4.2v13.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
