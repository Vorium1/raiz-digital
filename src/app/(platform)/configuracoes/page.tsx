import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { PageIntro } from "@/components/ui";
import { isDatabaseMode } from "@/lib/data-mode";
import { requirePlatformSession } from "@/lib/auth/session";
import { listTenantMembers } from "@/lib/repositories/team";
import { listAllLaboratories } from "@/lib/repositories/catalog";
import { listAuditEvents } from "@/lib/repositories/audit";
import { getTwoFactorStatus } from "@/lib/auth/two-factor";
import { getTenantBranding } from "@/lib/repositories/tenant-branding";
import { SettingsTabs } from "@/components/settings-tabs";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  if (!isDatabaseMode()) return <DemoSettings/>;
  const session = await requirePlatformSession();
  const [members, laboratories, auditEvents, twoFactor, branding] = await Promise.all([
    listTenantMembers(session.tenantId, session.userId),
    listAllLaboratories(session.tenantId, session.userId),
    listAuditEvents(session.tenantId, session.userId),
    getTwoFactorStatus(session.userId),
    getTenantBranding(session.tenantId),
  ]);
  const canManageLabs = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]).has(session.role);
  const canManageTeam = new Set(["SUPER_ADMIN", "TENANT_ADMIN"]).has(session.role);
  return <><Topbar eyebrow="Administração" title="Configurações"/><div className="content-wrap">
    <PageIntro title="Governança da plataforma" description={`Empresa ativa: ${session.tenantName}. Usuários, perfis e dados operacionais permanecem isolados pelo tenant da sessão.`}/>
    <SettingsTabs members={members as any} laboratories={laboratories as any} auditEvents={auditEvents as any} canManageTeam={canManageTeam} canManageLabs={canManageLabs} twoFactorEnabled={twoFactor.enabled} currentUserId={session.userId} branding={branding} canManageBranding={canManageTeam}/>
  </div></>;
}

const DEMO_MEMBERS = [
  { name: "Gui Bortoluzzi", email: "gui@graosul.com.br", role: "Administrador", status: "Ativo" },
  { name: "Ana Paula Ferreira", email: "ana.ferreira@graosul.com.br", role: "Agrônoma", status: "Ativo" },
  { name: "Lucas Martins", email: "lucas.martins@graosul.com.br", role: "Técnico de campo", status: "Ativo" },
  { name: "Marina Souza", email: "marina.souza@graosul.com.br", role: "Comercial", status: "Convite enviado" },
] as const;

function DemoSettings() {
  return <><Topbar eyebrow="Administração · demonstração" title="Configurações"/><div className="content-wrap"><div className="demo-banner"><Icon name="warning" size={14}/><span>Modo demonstração. Usuários abaixo são exemplos de UX e não representam contas reais.</span></div><PageIntro title="Governança da plataforma" description="Usuários, perfis de acesso, laboratórios homologados e marca dos relatórios — tudo isolado por empresa."/>
    <section className="card">
      <div className="field-ops-section-head compact"><div><span className="eyebrow">USUÁRIOS · EXEMPLO</span><h2>Equipe ({DEMO_MEMBERS.length})</h2></div></div>
      <div className="report-table-wrap"><table className="report-table">
        <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th></tr></thead>
        <tbody>{DEMO_MEMBERS.map((member) => (
          <tr key={member.email}><td>{member.name}</td><td>{member.email}</td><td>{member.role}</td><td>{member.status}</td></tr>
        ))}</tbody>
      </table></div>
    </section>
  </div></>;
}
