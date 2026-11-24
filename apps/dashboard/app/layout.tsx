import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KaiseHo · Family dashboard",
  description: "Daily AI check-in calls for elderly parents, powered by Ek Call",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
