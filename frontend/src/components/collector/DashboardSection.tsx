import type { ReactNode } from "react";
import type { DashboardSectionProps } from "./types";

export function DashboardSection({ children, className = "" }: DashboardSectionProps): ReactNode {
  return (
    <section className={`w-full ${className}`.trim()}>
      {children}
    </section>
  );
}

export default DashboardSection;
