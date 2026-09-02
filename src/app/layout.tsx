import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";
import "./globals.css";

// Tipografia oficial do Guia de Marca (docs/brand/Guia_de_Marca_Raiz_Digital.pdf):
// Sora para títulos/institucional, Inter para o restante da plataforma.
const sora = Sora({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-sora", display: "swap" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Raiz Digital", template: "%s · Raiz Digital" },
  description: "Inteligência agronômica do solo à decisão.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${sora.variable} ${inter.variable}`}>
      <body>
        <a className="skip-link" href="#conteudo-principal">Pular para o conteúdo principal</a>
        {children}
      </body>
    </html>
  );
}
