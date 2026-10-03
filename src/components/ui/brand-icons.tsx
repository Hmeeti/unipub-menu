type P = { className?: string };

export function InstagramIcon({ className }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function WhatsAppIcon({ className }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    >
      <path d="M4 20l1.2-3.6A8 8 0 1 1 8 19.1L4 20z" />
      <path
        d="M9.2 8.6c.2-.4.5-.4.8-.4h.5c.2 0 .4.1.5.4l.6 1.5c.1.2 0 .5-.1.6l-.5.6c.6 1.2 1.6 2.1 2.8 2.7l.6-.6c.2-.2.4-.2.6-.1l1.5.7c.3.1.4.3.4.5v.5c0 .3-.1.6-.4.8-.5.4-1.2.6-1.9.5-2.6-.4-5-2.8-5.4-5.4-.1-.7.1-1.4.5-1.9z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

/** 2GIS-like map pin glyph (generic, not the trademark logo). */
export function MapPinIcon({ className }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.6" />
    </svg>
  );
}
