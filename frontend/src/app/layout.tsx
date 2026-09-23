import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ServiceWorkerRegister } from "./sw-register";

// Leaflet CSS is required for the operational map component to render correctly.
// It must be loaded globally (not inside the map component) because the map
// uses a dynamic import with ssr:false — by the time Leaflet renders, the CSS
// must already be in the page.
// If leaflet is not installed (e.g. in a CI environment without node_modules),
// the build will fail here with a clear "Module not found" error rather than
// silently producing a broken map.
import "leaflet/dist/leaflet.css";

export const metadata: Metadata = {
  title: "EcoTrack — Smart Waste Management",
  description: "Smart waste management and environmental intelligence platform for Uganda.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#1b4332",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      {/*
       * Background color, text color, and font-family are set by the body
       * rule in globals.css — the single source of truth for these values.
       * antialiased stays here as a Tailwind utility; it adds -webkit-font-smoothing
       * and -moz-osx-font-smoothing which complement the font-family declaration
       * in globals.css without conflicting with it.
       */}
      <body className="min-h-full flex flex-col antialiased">
        <ServiceWorkerRegister />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
