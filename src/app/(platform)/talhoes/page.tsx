import Link from "next/link";
import { Icon } from "@/components/icon";
import { SimplePortfolioMap } from "@/components/simple-portfolio-map";
import { requirePlatformSession } from "@/lib/auth/session";
import { getPortfolioFieldSummaries } from "@/lib/repositories/dashboard";

export const metadata = { title: "Talhões" };

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
            {fields.map((field) => (
              <Link href={`/talhoes/${field.id}`} key={field.id} className="simple-field-row">
                <span className={`simple-field-dot state-${field.evaluationStatus.toLowerCase()}`} />
                <div><strong>{field.name}</strong><small>{field.propertyName} · {field.clientName}</small></div>
                <span className="simple-field-state">{STATUS_COPY[field.evaluationStatus]}</span>
                <Icon name="chevron" size={17}/>
              </Link>
            ))}
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
