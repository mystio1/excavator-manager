export function ExcavatorLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Boom + stick + bucket */}
      <path
        d="M13 15 L21 8 L26 16"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M26 16 L29 17.5 L28.5 20.5 L25 20.5 L24.5 17.5 Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Cab */}
      <rect x="4" y="14.5" width="11" height="8.5" rx="2" stroke="currentColor" strokeWidth="2.2" />
      <path d="M6.5 17 H10.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      {/* Undercarriage / tracks */}
      <rect x="2" y="24.5" width="19" height="4.2" rx="2.1" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  );
}
