import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "linkspage",
  description: "Build and share your link-in-bio page",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif" }}>
        <div>{children}</div>
      </body>
    </html>
  );
}
