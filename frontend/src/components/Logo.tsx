type Props = {
  size?: number;
  className?: string;
};

export function Logo({ size = 28, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="48" height="48" rx="12" fill="#0f0f1a" />
      <rect width="48" height="48" rx="12" fill="#6d5ef5" fillOpacity="0.08" />
      <rect x="0.5" y="0.5" width="47" height="47" rx="11.5" stroke="#6d5ef5" strokeOpacity="0.25" />
      <circle cx="21" cy="21" r="10.5" stroke="#6d5ef5" strokeWidth="2.25" />
      <path d="M16 21.5 L19.5 25 L26 17" stroke="#6d5ef5" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M29 29 L34.5 34.5" stroke="#6d5ef5" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}
