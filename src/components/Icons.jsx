import React from "react";

export function PinIcon() {
  return (
    <svg className="pin-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 22s7-6.1 7-12A7 7 0 0 0 5 10c0 5.9 7 12 7 12Z"
        fill="currentColor"
      />
      <circle cx="12" cy="10" r="2.8" fill="#ffffff" opacity="0.86" />
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
