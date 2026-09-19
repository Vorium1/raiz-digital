import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";
import "./globals.css";
import "./ux2.css";
import "./ux2-intake.css";
import "./ux2-review.css";
import "./ux2-concept.css";
import "./ux2-concept-detail.css";
import "./ux2-concept-shell-fixes.css";
import "./ux3-simple.css";
import "./ux3-simple-fields.css";
import "./ux3-simple-review.css";
import "./ux3-simple-results.css";
import "./ux3-simple-attention.css";
import "./ux3-field.css";
import "./ux3-analysis.css";
import "./ux3-send.css";
import "./ux3-result-document.css";
import "./ux3-context.css";
import "./ux3-accessibility.css";

// Tipografia oficial do Guia de Marca (docs/brand/Guia_de_Marca_Raiz_Digital.pdf):
// Sora para títulos/institucional, Inter para o restante da plataforma.
const sora = Sora({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-sora", display: "swap" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Raiz Digital", template: "%s · Raiz Digital" },
  description: "Inteligência agronômica do solo à decisão.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
