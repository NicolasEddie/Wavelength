import type { Metadata, Viewport } from "next";
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "@fontsource-variable/inter/index.css";
import AskWavelength from "@/components/chat/AskWavelength";
import InteractionEffects from "@/components/InteractionEffects";
import Starfield from "@/components/Starfield";
import "./globals.css";

// Fonts are self-hosted from npm (@fontsource), so builds need no network access.

export const metadata: Metadata = {
  title: { default: "Wavelength", template: "%s · Wavelength" },
  description:
    "Real Sloan Digital Sky Survey exposures, composited into colour in your browser. Adjust the stretch and source detection an astronomer would.",
};

export const viewport: Viewport = {
  themeColor: "#0a0916",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Starfield />
        <InteractionEffects />
        <div className="relative z-[1]">{children}</div>
        <AskWavelength />
      </body>
    </html>
  );
}
