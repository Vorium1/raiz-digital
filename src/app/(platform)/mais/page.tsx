import Link from "next/link";
import { Icon } from "@/components/icon";
import { LogoutButton } from "@/components/logout-button";
import { requirePlatformSession } from "@/lib/auth/session";
import { initials } from "@/lib/role-labels";

export const metadata = { title: "Mais" };

export default async function MorePage() {
  const session = await requirePlatformSession();
  const avatar = initials(session.name) || "R";
  const canManageSettings = session.role === "SUPER_ADMIN" || session.role === "TENANT_ADMIN" || session.isPlatformCurator;

  return (
    <div className="simple-home simple-more-page">
      <header className="simple-home-head">
        <div>
          <span>MAIS</span>
          <h1>Conta e opções</h1>
          <p>O que você usa com menos frequência fica aqui.</p>
        </div>
      </header>

      <section className="simple-more-account">
        <span className="simple-more-avatar">{avatar}</span>
        <div>
          <strong>{session.name}</strong>
          <small>{session.tenantName}</small>
        </div>
      </section>

      <section className="simple-more-list" aria-label="Mais opções">
        {canManageSettings && (
          <Link href="/configuracoes">
            <span><Icon name="settings" size={21}/></span>
            <div>
              <strong>Configurações avançadas</strong>
              <small>Conta, segurança, equipe e opções técnicas.</small>
            </div>
            <Icon name="chevron" size={17}/>
          </Link>
        )}

        <div className="simple-more-logout">
          <span><Icon name="logout" size={21}/></span>
          <div>
            <strong>Sair</strong>
            <small>Encerrar esta sessão da RAIZ.</small>
          </div>
          <LogoutButton variant="menu"/>
        </div>
      </section>
    </div>
  );
}
