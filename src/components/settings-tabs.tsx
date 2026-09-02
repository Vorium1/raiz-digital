"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";
import { roleLabel } from "@/lib/role-labels";
import { auditActionLabel, auditEntityLabel } from "@/lib/audit-labels";
import { formatRelativeOrDate } from "@/domain/analysis-ui";

type Member = { id: string; name: string; email: string; role: string; active: boolean; lastLoginAt: string | null };
type Laboratory = { id: string; name: string; taxId: string | null };
type AuditEvent = { id: string; action: string; entityType: string; createdAt: string; actorName: string | null };

const tabs = [
  { key: "team", label: "Usuários e permissões", icon: "users" },
  { key: "library", label: "Biblioteca técnica", icon: "shield" },
  { key: "labs", label: "Laboratórios", icon: "flask" },
  { key: "billing", label: "Mercado Pago", icon: "wallet" },
  { key: "email", label: "E-mail e relatórios", icon: "file" },
  { key: "audit", label: "Auditoria", icon: "history" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

const notImplementedCopy: Partial<Record<TabKey, string>> = {
  library: "A biblioteca de laboratórios e métodos homologados entra na Fase C do roadmap.",
  billing: "A cobrança via Mercado Pago fica desativada até a homologação do webhook (ver Financeiro).",
  email: "Modelos de e-mail e envio automático de relatório ainda não existem.",
};

export function SettingsTabs({ members, laboratories: initialLaboratories, auditEvents }: { members: Member[]; laboratories: Laboratory[]; auditEvents: AuditEvent[] }) {
  const [tab, setTab] = useState<TabKey>("team");
  const [laboratories, setLaboratories] = useState(initialLaboratories);
  const [newLabName, setNewLabName] = useState("");
  const [creatingLab, setCreatingLab] = useState(false);
  const [labError, setLabError] = useState("");

  async function createLaboratory() {
    const name = newLabName.trim();
    if (!name) return;
    setCreatingLab(true);
    setLabError("");
    try {
      const response = await fetch("/api/laboratories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível cadastrar o laboratório.");
      setLaboratories((current) => [...current, payload.laboratory as Laboratory].sort((a, b) => a.name.localeCompare(b.name)));
      setNewLabName("");
    } catch (error) {
      setLabError(error instanceof Error ? error.message : "Falha ao cadastrar laboratório.");
    } finally {
      setCreatingLab(false);
    }
  }

  return (
    <div className="settings-grid">
      <section className="card settings-menu">
        {tabs.map((item) => (
          <button key={item.key} type="button" className={tab === item.key ? "active" : ""} onClick={() => setTab(item.key)}>
            <Icon name={item.icon} />
            {item.label}
          </button>
        ))}
      </section>

      <section className="card">
        {tab === "team" && (
          <>
            <div className="card-header"><div><span className="eyebrow">EQUIPE REAL</span><h2>Usuários e permissões</h2></div><span className="status-badge success"><i />Tenant protegido</span></div>
            {members.length ? (
              <div className="data-card">
                <table className="data-table">
                  <thead><tr><th>Usuário</th><th>Perfil</th><th>Situação</th><th>Último acesso</th></tr></thead>
                  <tbody>
                    {members.map((member) => (
                      <tr key={member.id}>
                        <td><strong>{member.name}</strong><small>{member.email}</small></td>
                        <td>{roleLabel[member.role] ?? member.role}</td>
                        <td><StatusBadge tone={member.active ? "success" : "waiting"}>{member.active ? "Ativo" : "Inativo"}</StatusBadge></td>
                        <td>{member.lastLoginAt ? formatRelativeOrDate(member.lastLoginAt) : "Ainda não acessou"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state"><Icon name="users" /><strong>Nenhum membro encontrado</strong><small>O tenant atual não possui vínculos ativos além da configuração de sessão.</small></div>
            )}
            <div className="module-note"><Icon name="shield" size={15} /><span><strong>Convites ainda não estão habilitados.</strong><small>A próxima etapa adicionará convite com expiração, definição de perfil e 2FA para administradores.</small></span></div>
          </>
        )}

        {tab === "labs" && (
          <>
            <div className="card-header"><div><span className="eyebrow">CADASTRO REAL</span><h2>Laboratórios</h2></div><span className="field-ops-count">{laboratories.length}</span></div>
            {laboratories.length ? (
              <div className="data-card">
                <table className="data-table">
                  <thead><tr><th>Nome</th><th>CNPJ/CPF</th></tr></thead>
                  <tbody>{laboratories.map((lab) => <tr key={lab.id}><td><strong>{lab.name}</strong></td><td>{lab.taxId || "—"}</td></tr>)}</tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state"><Icon name="flask" /><strong>Nenhum laboratório cadastrado</strong><small>Cadastre abaixo, ou direto na tela de nova análise.</small></div>
            )}
            <div className="new-lab-inline" style={{ margin: "0 20px 18px" }}>
              <input value={newLabName} onChange={(event) => setNewLabName(event.target.value)} placeholder="Nome do laboratório" disabled={creatingLab} />
              <button type="button" className="button secondary" disabled={creatingLab || !newLabName.trim()} onClick={() => void createLaboratory()}>{creatingLab ? "Salvando…" : "Cadastrar"}</button>
            </div>
            {labError && <div className="import-message danger" style={{ margin: "0 20px 18px" }}><Icon name="warning" /><div><strong>Não foi possível cadastrar</strong><small>{labError}</small></div></div>}
          </>
        )}

        {tab === "audit" && (
          <>
            <div className="card-header"><div><span className="eyebrow">TRILHA REAL</span><h2>Auditoria</h2></div><span className="field-ops-count">{auditEvents.length} evento(s)</span></div>
            {auditEvents.length ? (
              <div className="data-card">
                <table className="data-table">
                  <thead><tr><th>Ação</th><th>Quem</th><th>Quando</th></tr></thead>
                  <tbody>
                  {auditEvents.map((event) => (
                    <tr key={event.id}>
                      <td><strong>{auditActionLabel[event.action] ?? event.action}</strong><small>{auditEntityLabel[event.entityType] ?? event.entityType}</small></td>
                      <td>{event.actorName ?? "Sistema"}</td>
                      <td>{formatRelativeOrDate(event.createdAt)}</td>
                    </tr>
                  ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state"><Icon name="history" /><strong>Nenhum evento registrado ainda</strong><small>Toda criação e importação relevante fica registrada aqui, com autor e horário.</small></div>
            )}
          </>
        )}

        {(tab === "library" || tab === "billing" || tab === "email") && (
          <div className="empty-state"><Icon name="clock" /><strong>Ainda não implementado</strong><small>{notImplementedCopy[tab]}</small></div>
        )}
      </section>
    </div>
  );
}
