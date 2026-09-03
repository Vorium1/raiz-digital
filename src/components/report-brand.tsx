import { BrandLogo } from "@/components/brand-logo";
import type { TenantBranding } from "@/lib/repositories/tenant-branding";

/**
 * Cabeçalho de marca do relatório entregue ao produtor: usa o logo/nome configurados pela empresa
 * cliente (Settings → E-mail e relatórios) quando existir, para que o documento saia com a marca de
 * quem realmente assina e entrega — nunca com a marca da RAIZ Digital nesse caso. Sem configuração,
 * cai no logo padrão da RAIZ Digital (nunca fica sem marca nenhuma).
 */
export function ReportBrand({ branding }: { branding: TenantBranding }) {
  if (!branding.logoDataUrl) return <BrandLogo variant="light" />;
  return (
    <span className="report-brand">
      {/* eslint-disable-next-line @next/next/no-img-element -- logo enviado pelo cliente (data URI), não é asset estático do projeto */}
      <img src={branding.logoDataUrl} alt={branding.displayName} className="report-brand-logo" />
      <strong className="report-brand-name">{branding.displayName}</strong>
    </span>
  );
}

export function ReportSignature({ branding }: { branding: TenantBranding }) {
  if (!branding.responsibleName) return null;
  return (
    <footer className="report-brand-signature">
      <div className="report-brand-signature-line" />
      <strong>{branding.responsibleName}</strong>
      {branding.responsibleRegistration && <small>{branding.responsibleRegistration}</small>}
      <small>Responsável técnico · {branding.displayName}</small>
    </footer>
  );
}
