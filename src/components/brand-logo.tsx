import Image from "next/image";

const ICON = {
  dark: { src: "/brand/symbol-dark.png", width: 951, height: 1042 },
  light: { src: "/brand/symbol-light.png", width: 966, height: 1047 },
} as const;

/**
 * Marca oficial (guia de marca): símbolo real (arquivo fornecido, sem
 * redesenho) + wordmark "RAIZ DIGITAL" tipografado nas fontes oficiais.
 * `variant` escolhe o recorte do símbolo com o fundo que combina com o
 * contexto (escuro/claro) e a cor do texto "RAIZ".
 */
export function BrandLogo({
  variant = "dark",
  height,
  priority,
  className,
}: {
  variant?: "dark" | "light";
  /** Altura em px. Se omitido, o tamanho vem do CSS (contexto já define via classe pai). */
  height?: number;
  priority?: boolean;
  className?: string;
}) {
  const icon = ICON[variant];
  const style = height ? { height, fontSize: height * 0.32 } : undefined;
  return (
    <span className={`brand-logo${className ? ` ${className}` : ""}`} style={style}>
      <Image src={icon.src} alt="" width={icon.width} height={icon.height} priority={priority} style={{ height: "100%", width: "auto" }} />
      <span className={`brand-logo-word${variant === "light" ? " on-light" : ""}`}>
        <span>RAIZ</span>
        <span className="accent">DIGITAL</span>
      </span>
    </span>
  );
}
