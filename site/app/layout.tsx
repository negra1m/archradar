import type { Metadata } from "next";
import { Inter, Poppins, Orbitron } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
  variable: "--font-poppins",
});
const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["900"],
  variable: "--font-orbitron",
});

export const metadata: Metadata = {
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  title: "archradar — Motor de Inteligência Arquitetural | Few Company",
  description:
    "Escaneie seu projeto frontend, detecte complexidade e dependências circulares, e corrija o que importa. CLI npm da Few Company.",
  keywords: [
    "archradar",
    "frontend architecture",
    "code quality",
    "dependency analysis",
    "circular dependencies",
    "health score",
    "CLI",
    "npm",
    "Few Company",
  ],
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "https://archradar.fewcompany.com",
  },
  openGraph: {
    title: "archradar — Motor de Inteligência Arquitetural | Few Company",
    description:
      "Escaneie seu projeto frontend, detecte complexidade e dependências circulares, e corrija o que importa.",
    url: "https://archradar.fewcompany.com",
    siteName: "archradar",
    images: [
      {
        url: "https://archradar.fewcompany.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "archradar — Motor de Inteligência Arquitetural",
      },
    ],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "archradar — Motor de Inteligência Arquitetural | Few Company",
    description:
      "Escaneie seu projeto frontend, detecte complexidade e dependências circulares, e corrija o que importa.",
    images: ["https://archradar.fewcompany.com/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${poppins.variable} ${orbitron.variable} md:h-full antialiased`}
    >
      <body className="md:h-full md:overflow-hidden font-sans">{children}</body>
    </html>
  );
}
