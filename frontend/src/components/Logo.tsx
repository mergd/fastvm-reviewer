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
      <rect width="48" height="48" rx="12" fill="#5b4ee0" />
      <circle cx="19" cy="19" r="9" stroke="white" strokeOpacity="0.9" strokeWidth="2.5" />
      <path d="M13.5 19.5 L17.5 23.5 L25 15" stroke="white" strokeOpacity="0.9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M26 26 L37 37" stroke="white" strokeOpacity="0.75" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
