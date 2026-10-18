import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "UNO Online — Good friends. Great rivalries.",
  description: "A private card table for two to four friends. Share a room, play a round, and make time for one more game.",
  applicationName: "UNO Online",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" data-scroll-behavior="smooth"><body><a href="#main" className="skip-link">Skip to content</a>{children}</body></html>;
}
