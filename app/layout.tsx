import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aarush",
  description: "A persistent, cloud-native personal agent with long-term memory.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link className="brand" href="/">Aarush<span> / continuity desk</span></Link>
          <nav><Link href="/">Chat</Link><Link href="/memories">Memories</Link></nav>
        </header>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
