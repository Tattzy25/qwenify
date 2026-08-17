import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...rest }: P): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    ...rest,
  };
}

export const IconMic = (p: P) => (
  <svg {...base(p)}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
  </svg>
);

export const IconMicOff = (p: P) => (
  <svg {...base(p)}>
    <path d="M15 9.5V6a3 3 0 0 0-5.9-.8" />
    <path d="M9 9.5v1.5a3 3 0 0 0 5.2 2" />
    <path d="M5 11a7 7 0 0 0 11.6 5.3" />
    <path d="M19 11a6.9 6.9 0 0 1-.4 2.3" />
    <path d="M12 18v3" />
    <path d="M4 4l16 16" />
  </svg>
);

export const IconCam = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="6" width="13" height="12" rx="3" />
    <path d="M16 10.5l4.2-2.6a.6.6 0 0 1 .8.5v7.2a.6.6 0 0 1-.8.5L16 13.5" />
  </svg>
);

export const IconCamOff = (p: P) => (
  <svg {...base(p)}>
    <path d="M8.5 6H13a3 3 0 0 1 3 3v1.5l4.2-2.6a.6.6 0 0 1 .8.5v7.2" />
    <path d="M16 13.5v1.5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3" />
    <path d="M4 4l16 16" />
  </svg>
);

export const IconCaptions = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="M10.5 10.2a2.2 2.2 0 0 0-3.6 1.8 2.2 2.2 0 0 0 3.6 1.8" />
    <path d="M17.2 10.2a2.2 2.2 0 0 0-3.6 1.8 2.2 2.2 0 0 0 3.6 1.8" />
  </svg>
);

export const IconPhone = (p: P) => (
  <svg {...base(p)}>
    <path d="M7.5 3.5h2.2l1.4 3.8-1.9 1.5a12.5 12.5 0 0 0 6 6l1.5-1.9 3.8 1.4v2.2a2 2 0 0 1-2.1 2A16.5 16.5 0 0 1 5.5 5.6a2 2 0 0 1 2-2.1z" />
  </svg>
);

export const IconPhoneDown = (p: P) => (
  <svg {...base(p)}>
    <path d="M3.6 13.2c4.8-4.6 12-4.6 16.8 0l1.3 1.2a1.4 1.4 0 0 1 .1 2l-1.5 1.6a1.4 1.4 0 0 1-1.9.1l-2.3-1.8a1.4 1.4 0 0 1-.5-1.2v-1.2a10.5 10.5 0 0 0-5.2 0v1.2a1.4 1.4 0 0 1-.5 1.2l-2.3 1.8a1.4 1.4 0 0 1-1.9-.1l-1.5-1.6a1.4 1.4 0 0 1 .1-2z" />
  </svg>
);

export const IconGear = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.8l1.2 2.3a7 7 0 0 1 2.2.9l2.5-.7 1.3 2.2-1.7 1.9a7 7 0 0 1 0 2.5l1.7 1.9-1.3 2.2-2.5-.7a7 7 0 0 1-2.2.9L12 21.2l-1.2-2.3a7 7 0 0 1-2.2-.9l-2.5.7-1.3-2.2 1.7-1.9a7 7 0 0 1 0-2.5L4.8 6.5l1.3-2.2 2.5.7a7 7 0 0 1 2.2-.9z" />
  </svg>
);

export const IconX = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const IconKey = (p: P) => (
  <svg {...base(p)}>
    <circle cx="8" cy="14" r="4" />
    <path d="M11 11l8-8" />
    <path d="M16.5 5.5l2.5 2.5" />
    <path d="M14 8l2 2" />
  </svg>
);

export const IconPlug = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3v4" />
    <path d="M5 7h14l-1.2 5.2a6 6 0 0 1-11.6 0z" />
    <path d="M12 15.5V21" />
  </svg>
);

export const IconCheck = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export const IconAlert = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.5l9.3 16H2.7z" />
    <path d="M12 10v4" />
    <path d="M12 16.8v.2" />
  </svg>
);

export const IconWrench = (p: P) => (
  <svg {...base(p)}>
    <path d="M14.2 6.3a4.4 4.4 0 0 1 5.6-.6l-3 3 .5 2.5 2.5.5 3-3a4.4 4.4 0 0 1-6.1 5.9L8.5 20.8a2 2 0 0 1-2.9-2.9l6.2-8.2a4.4 4.4 0 0 1 2.4-3.4z" transform="scale(0.82) translate(2.4 2.4)" />
  </svg>
);

export const IconSpinner = (p: P) => (
  <svg {...base(p)} className={`spin ${p.className ?? ''}`}>
    <path d="M12 3a9 9 0 1 1-8.5 6" />
  </svg>
);

export const IconEye = (p: P) => (
  <svg {...base(p)}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconEyeOff = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 4l16 16" />
    <path d="M9.9 5.9A9.4 9.4 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8M6.1 8A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9.3 9.3 0 0 0 4-.9" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </svg>
);

export const IconImage = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="4.5" width="18" height="15" rx="3" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M3.5 17.5l4.8-4.7a1.2 1.2 0 0 1 1.7 0l6.5 6.2" />
    <path d="M14.5 15.2l2.3-2.3a1.2 1.2 0 0 1 1.7 0l2 1.9" />
  </svg>
);

export const IconBag = (p: P) => (
  <svg {...base(p)}>
    <path d="M5.5 8h13l-1.1 11.2a1.8 1.8 0 0 1-1.8 1.6H8.4a1.8 1.8 0 0 1-1.8-1.6z" />
    <path d="M9 10.2V6.5a3 3 0 0 1 6 0v3.7" />
  </svg>
);

export const IconCart = (p: P) => (
  <svg {...base(p)}>
    <path d="M3.5 5h2l2.2 10.5a1.6 1.6 0 0 0 1.6 1.3h7.6a1.6 1.6 0 0 0 1.6-1.2L20.5 8H6.2" />
    <circle cx="10" cy="20" r="1.2" />
    <circle cx="17" cy="20" r="1.2" />
  </svg>
);

export const Logo = ({ size = 22, ...rest }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...rest}>
    <circle cx="12" cy="12" r="5.4" fill="currentColor" opacity="0.92" />
    <ellipse cx="12" cy="12" rx="10.2" ry="4.1" stroke="currentColor" strokeWidth="1.4" opacity="0.55" transform="rotate(-18 12 12)" />
    <circle cx="20.4" cy="8.2" r="1.5" fill="currentColor" opacity="0.8" />
  </svg>
);
