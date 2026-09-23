/**
 * NavIcon — renders a single navigation icon from an SVG path string.
 * Uses stroke/currentColor so it inherits text color from parent.
 */
import type { ReactNode } from "react";

interface NavIconProps {
  path: string;
  className?: string;
  "aria-hidden"?: boolean;
}

export function NavIcon({
  path,
  className = "h-5 w-5",
  "aria-hidden": ariaHidden = true,
}: NavIconProps): ReactNode {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.75}
      stroke="currentColor"
      className={className}
      aria-hidden={ariaHidden}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

export default NavIcon;
