import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Omni Force Vector · Three platforms. One subscription.",
  description:
    "Manage business operations, discover the drone industry and put AI to work through one central platform. WSSO and Drone Directory sign-in through Omni Force Vector is not configured. Workforce 2.0 is free to download; its in-app paid options are billed separately.",
  icons: { icon: "/omniforce-vector-logo.png", apple: "/omniforce-vector-logo.png" },
  openGraph: {
    title: "Omni Force Vector",
    images: [{ url: "/omniforce-vector-logo.png", alt: "Omni Force Vector" }],
  },
};

export const viewport: Viewport = { themeColor: "#0B101B", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/omniforce-vector-logo.png" type="image/png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
