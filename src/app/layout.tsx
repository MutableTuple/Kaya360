import type { Metadata, Viewport } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { ToastProvider } from "@/components/ui";

export const metadata: Metadata = { title: { default: "Kaya Project Intelligence 360", template: "%s · Kaya PI 360" }, description: "AI-powered project lead generation & BD CRM for Kaya Interiors Private Limited" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0e1e3d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en-IN"><body><ToastProvider>{children}</ToastProvider></body></html>;
}
