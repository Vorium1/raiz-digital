import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Raiz Digital", template: "%s · Raiz Digital" },
  description: "Inteligência agronômica do solo à decisão.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <a className="skip-link" href="#conteudo-principal">Pular para o conteúdo principal</a>
        {children}
      </body>
    </html>
  );
}
