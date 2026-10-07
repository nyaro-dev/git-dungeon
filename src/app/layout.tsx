import type { Metadata, Viewport } from "next";
import { Baumans, Fredoka, Geist_Mono } from "next/font/google";
import "./globals.css";

// Mêmes typos que le portfolio. Fredoka variable (300–700) pour le texte courant.
const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
});

// Chiffres, sha, chemins.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Titres : une seule graisse (400). Jamais de classe bold : le gras synthétique bave.
const baumans = Baumans({
  variable: "--font-baumans",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Git Dungeon",
  description: "Colle l'URL d'un dépôt GitHub public : son historique devient un donjon jouable.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${fredoka.variable} ${geistMono.variable} ${baumans.variable} h-full antialiased`}>
      <body className="noise-bg flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
