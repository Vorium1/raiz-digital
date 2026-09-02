import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { PageIntro, StatusBadge } from "@/components/ui";
import { isDatabaseMode } from "@/lib/data-mode";
import { requirePlatformSession } from "@/lib/auth/session";
import { listTenantMembers } from "@/lib/repositories/team";
import { formatRelativeOrDate } from "@/domain/analysis-ui";
import { roleLabel } from "@/lib/role-labels";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  if (!isDatabaseMode()) return <DemoSettings/>;
  const session = await requirePlatformSession();
  const members = await listTenantMembers(session.tenantId, session.userId);
  return <><Topbar eyebrow="Administração" title="Configurações"/><div className="content-wrap">
    <PageIntro title="Governança da plataforma" description={`Empresa ativa: ${session.tenantName}. Usuários, perfis e dados operacionais permanecem isolados pelo tenant da sessão.`}/>
    <div className="settings-grid"><section className="card settings-menu"><button className="active"><Icon name="users"/>Usuários e permissões</button><button><Icon name="shield"/>Biblioteca técnica</button><button><Icon name="flask"/>Laboratórios</button><button><Icon name="wallet"/>Mercado Pago</button><button><Icon name="file"/>E-mail e relatórios</button><button><Icon name="history"/>Auditoria</button></section><section className="card"><div className="card-header"><div><span className="eyebrow">EQUIPE REAL</span><h2>Usuários e permissões</h2></div><span className="status-badge success"><i/>Tenant protegido</span></div>
      {members.length ? <table className="data-table"><thead><tr><th>Usuário</th><th>Perfil</th><th>Situação</th><th>Último acesso</th></tr></thead><tbody>{members.map((member:any)=><tr key={member.id}><td><strong>{member.name}</strong><small>{member.email}</small></td><td>{roleLabel[member.role] ?? member.role}</td><td><StatusBadge tone={member.active ? "success" : "waiting"}>{member.active ? "Ativo" : "Inativo"}</StatusBadge></td><td>{member.lastLoginAt ? formatRelativeOrDate(member.lastLoginAt) : "Ainda não acessou"}</td></tr>)}</tbody></table> : <div className="empty-state"><Icon name="users"/><strong>Nenhum membro encontrado</strong><small>O tenant atual não possui vínculos ativos além da configuração de sessão.</small></div>}
      <div className="module-note"><Icon name="shield" size={15}/><span><strong>Convites ainda não estão habilitados.</strong><small>A próxima etapa adicionará convite com expiração, definição de perfil e 2FA para administradores.</small></span></div>
    </section></div></div></>;
}

function DemoSettings() {
  return <><Topbar eyebrow="Administração · demonstração" title="Configurações"/><div className="content-wrap"><div className="demo-banner"><Icon name="warning" size={14}/><span>Modo demonstração. Usuários abaixo são exemplos de UX e não representam contas reais.</span></div><PageIntro title="Governança da plataforma" description="Visual de usuários, integrações e biblioteca técnica."/><div className="data-card"><div className="empty-state"><Icon name="settings"/><strong>Configurações demonstrativas</strong><small>Ative DATA_MODE=database para visualizar os membros reais do tenant.</small></div></div></div></>;
}
