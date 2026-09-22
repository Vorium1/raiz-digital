import Link from "next/link";
import { Icon } from "@/components/icon";
import { SimplePortfolioMap } from "@/components/simple-portfolio-map";
import { requirePlatformSession } from "@/lib/auth/session";
import { getPortfolioFieldSummaries } from "@/lib/repositories/dashboard";
import { VIGOR_ZONE_LABELS, type VigorZone } from "@/domain/ndvi-engine";

export const metadata = { title: "Talhões" };

const VIGOR_ZONE_ORDER: VigorZone[] = ["SEM_VEGETACAO", "BAIXO", "MODERADO", "ALTO", "MUITO_ALTO"];

function dominantVigor(zoneBreakdown: Record<string, number> | null) {
  if (!zoneBreakdown) return null;
  let best: VigorZone | null = null;
  let bestPct = -1;
  for (const zone of VIGOR_ZONE_ORDER) {
    const pct = Number(zoneBreakdown[zone] ?? 0);
    if (pct > bestPct) {
      best = zone;
      bestPct = pct;
    }
  }
  return best && bestPct >= 0 ? { zone: best, pct: bestPct } : null;
}


const STATUS_COPY = {
  SEM_ANALISE: "Sem dados ainda",
  NAO_INTERPRETAVEL: "Precisa continuar",
  EM_ANDAMENTO: "Em andamento",
  APROVADO: "Pronto",
} as const;

export default async function TalhoesPage() {
  const session = await requirePlatformSession();
  const fields = await getPortfolioFieldSummaries(session.tenantId, {}, session.userId);

  return (
    <div className="simple-home simple-fields-page">
      <header className="simple-home-head">
        <div><span>SEUS TALHÕES</span><h1>Talhões</h1><p>Abra uma área para ver tudo o que existe nela.</p></div>
        <Link href="/enviar" className="simple-soft-button"><Icon name="upload" size={17}/> Enviar dados</Link>
      </header>

      {fields.length > 0 ? (
        <>
          <section className="simple-fields-section">
            <div className="simple-section-head"><div><span>MAPA</span><h2>{fields.length} {fields.length === 1 ? "talhão" : "talhões"}</h2><p>Clique em uma área para abrir.</p></div></div>
            <SimplePortfolioMap fields={fields as any} height={430}/>
          </section>

          <section className="simple-field-list" aria-label="Lista de talhões">
            {fields.map((field) => {
              const dominant = dominantVigor(field.ndviZoneBreakdown);
              return (
                <Link href={`/talhoes/${field.id}`} key={field.id} className="simple-field-row">
                  <span className={`simple-field-dot state-${field.evaluationStatus.toLowerCase()}`} />
                  <div className="simple-field-row-main">
                    <strong>{field.name}</strong>
                    <small>{field.propertyName} · {field.clientName}</small>
                    {field.ndviMean != null && (
                      <span className="simple-field-ndvi">
                        <Icon name="leaf" size={12}/>
                        NDVI {field.ndviMean.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        {dominant ? ` · ${VIGOR_ZONE_LABELS[dominant.zone]}` : ""}
                      </span>
                    )}
                  </div>
                  <span className="simple-field-state">{STATUS_COPY[field.evaluationStatus]}</span>
                  <Icon name="chevron" size={17}/>
                </Link>
              );
            })}
          </section>
        </>
      ) : (
        <div className="simple-empty-map">
          <Icon name="layers" size={36}/>
          <strong>Nenhum talhão cadastrado.</strong>
          <small>Envie o primeiro laudo e a RAIZ ajuda a cadastrar a área sem sair do fluxo.</small>
          <Link href="/enviar">Começar agora <Icon name="arrow" size={14}/></Link>
        </div>
      )}
    </div>
  );
}
