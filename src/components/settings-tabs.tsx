"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";
import { roleLabel } from "@/lib/role-labels";
import { auditActionLabel, auditEntityLabel } from "@/lib/audit-labels";
import { formatRelativeOrDate } from "@/domain/analysis-ui";

type Member = { id: string; name: string; email: string; role: string; active: boolean; lastLoginAt: string | null };
type Laboratory = { id: string; name: string; taxId: string | null; active: boolean };
type AuditEvent = { id: string; action: string; entityType: string; createdAt: string; actorName: string | null };

const invitableRoles = [
  { value: "TENANT_ADMIN", label: "Administrador" },
  { value: "AGRONOMIST", label: "Agrônomo" },
  { value: "FIELD_TECH", label: "Técnico de campo" },
  { value: "COMMERCIAL", label: "Comercial" },
  { value: "VIEWER", label: "Leitura" },
] as const;

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

export function SettingsTabs({ members: initialMembers, laboratories: initialLaboratories, auditEvents, canManageTeam, canManageLabs, twoFactorEnabled: initialTwoFactorEnabled, currentUserId }: { members: Member[]; laboratories: Laboratory[]; auditEvents: AuditEvent[]; canManageTeam: boolean; canManageLabs: boolean; twoFactorEnabled: boolean; currentUserId: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("team");
  const [members, setMembers] = useState(initialMembers);
  const [memberBusy, setMemberBusy] = useState("");
  const [memberError, setMemberError] = useState("");

  async function changeMemberRole(memberId: string, role: string) {
    setMemberBusy(`role-${memberId}`);
    setMemberError("");
    try {
      const response = await fetch(`/api/team/${memberId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ role }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível alterar o perfil.");
      setMembers((current) => current.map((member) => member.id === memberId ? { ...member, role } : member));
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : "Falha ao alterar perfil.");
    } finally {
      setMemberBusy("");
    }
  }

  async function toggleMemberActive(memberId: string, active: boolean) {
    setMemberBusy(`active-${memberId}`);
    setMemberError("");
    try {
      const response = await fetch(`/api/team/${memberId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível atualizar a situação.");
      setMembers((current) => current.map((member) => member.id === memberId ? { ...member, active } : member));
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : "Falha ao atualizar situação.");
    } finally {
      setMemberBusy("");
    }
  }
  const [laboratories, setLaboratories] = useState(initialLaboratories);
  const [newLabName, setNewLabName] = useState("");
  const [creatingLab, setCreatingLab] = useState(false);
  const [labError, setLabError] = useState("");

  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("VIEWER");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteResult, setInviteResult] = useState<{ email: string; password: string | null; createdNewUser: boolean } | null>(null);

  async function inviteMember() {
    const name = inviteName.trim();
    const email = inviteEmail.trim();
    if (!name || !email) return;
    setInviting(true);
    setInviteError("");
    setInviteResult(null);
    try {
      const response = await fetch("/api/team", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, email, role: inviteRole }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível convidar o membro.");
      setInviteResult({ email, password: payload.temporaryPassword, createdNewUser: payload.createdNewUser });
      setInviteName("");
      setInviteEmail("");
      router.refresh();
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : "Falha ao convidar membro.");
    } finally {
      setInviting(false);
    }
  }

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(initialTwoFactorEnabled);
  const [twoFactorSetup, setTwoFactorSetup] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [showDisableForm, setShowDisableForm] = useState(false);

  async function startTwoFactorSetup() {
    setTwoFactorBusy(true);
    setTwoFactorError("");
    try {
      const response = await fetch("/api/auth/2fa/setup", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível iniciar a configuração.");
      setTwoFactorSetup({ secret: payload.secret, qrCodeDataUrl: payload.qrCodeDataUrl });
    } catch (error) {
      setTwoFactorError(error instanceof Error ? error.message : "Falha ao iniciar configuração do 2FA.");
    } finally {
      setTwoFactorBusy(false);
    }
  }

  async function confirmTwoFactorSetup() {
    setTwoFactorBusy(true);
    setTwoFactorError("");
    try {
      const response = await fetch("/api/auth/2fa/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: twoFactorCode }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Código inválido.");
      setBackupCodes(payload.backupCodes as string[]);
      setTwoFactorEnabled(true);
      setTwoFactorSetup(null);
      setTwoFactorCode("");
    } catch (error) {
      setTwoFactorError(error instanceof Error ? error.message : "Falha ao confirmar o 2FA.");
    } finally {
      setTwoFactorBusy(false);
    }
  }

  async function disableTwoFactorSubmit() {
    setTwoFactorBusy(true);
    setTwoFactorError("");
    try {
      const response = await fetch("/api/auth/2fa", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: disablePassword }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível desativar.");
      setTwoFactorEnabled(false);
      setShowDisableForm(false);
      setDisablePassword("");
      setBackupCodes(null);
    } catch (error) {
      setTwoFactorError(error instanceof Error ? error.message : "Falha ao desativar o 2FA.");
    } finally {
      setTwoFactorBusy(false);
    }
  }

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  async function submitPasswordChange() {
    setPasswordError("");
    setPasswordSuccess(false);
    if (newPassword.length < 10) { setPasswordError("A nova senha precisa ter ao menos 10 caracteres."); return; }
    if (newPassword !== confirmPassword) { setPasswordError("A confirmação não bate com a nova senha."); return; }
    setChangingPassword(true);
    try {
      const response = await fetch("/api/auth/change-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível alterar a senha.");
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Falha ao alterar senha.");
    } finally {
      setChangingPassword(false);
    }
  }

  const [editingLabId, setEditingLabId] = useState("");
  const [editLabName, setEditLabName] = useState("");
  const [editLabTaxId, setEditLabTaxId] = useState("");
  const [labBusy, setLabBusy] = useState("");

  function startEditLab(lab: Laboratory) {
    setEditingLabId(lab.id); setEditLabName(lab.name); setEditLabTaxId(lab.taxId ?? "");
  }

  async function saveLab(id: string) {
    setLabBusy(`save-${id}`);
    setLabError("");
    try {
      const response = await fetch(`/api/laboratories/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: editLabName, taxId: editLabTaxId }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível editar o laboratório.");
      setLaboratories((current) => current.map((lab) => lab.id === id ? (payload.laboratory as Laboratory) : lab));
      setEditingLabId("");
    } catch (error) {
      setLabError(error instanceof Error ? error.message : "Falha ao editar laboratório.");
    } finally {
      setLabBusy("");
    }
  }

  async function toggleLabActive(lab: Laboratory) {
    setLabBusy(`active-${lab.id}`);
    setLabError("");
    try {
      const response = await fetch(`/api/laboratories/${lab.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: !lab.active }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível atualizar a situação.");
      setLaboratories((current) => current.map((item) => item.id === lab.id ? (payload.laboratory as Laboratory) : item));
    } catch (error) {
      setLabError(error instanceof Error ? error.message : "Falha ao atualizar situação.");
    } finally {
      setLabBusy("");
    }
  }

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
                  <thead><tr><th>Usuário</th><th>Perfil</th><th>Situação</th><th>Último acesso</th>{canManageTeam && <th></th>}</tr></thead>
                  <tbody>
                    {members.map((member) => {
                      const manageable = canManageTeam && member.role !== "SUPER_ADMIN" && member.id !== currentUserId;
                      return (
                        <tr key={member.id}>
                          <td><strong>{member.name}</strong><small>{member.email}</small></td>
                          <td>
                            {manageable ? (
                              <select value={member.role} disabled={memberBusy === `role-${member.id}`} onChange={(e) => void changeMemberRole(member.id, e.target.value)}>
                                {invitableRoles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                              </select>
                            ) : (roleLabel[member.role] ?? member.role)}
                          </td>
                          <td><StatusBadge tone={member.active ? "success" : "waiting"}>{member.active ? "Ativo" : "Inativo"}</StatusBadge></td>
                          <td>{member.lastLoginAt ? formatRelativeOrDate(member.lastLoginAt) : "Ainda não acessou"}</td>
                          {canManageTeam && (
                            <td className="client-row-actions">
                              {manageable && (
                                <button type="button" className="button tiny" disabled={memberBusy === `active-${member.id}`} onClick={() => void toggleMemberActive(member.id, !member.active)}>
                                  {memberBusy === `active-${member.id}` ? "…" : member.active ? "Desativar" : "Reativar"}
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state"><Icon name="users" /><strong>Nenhum membro encontrado</strong><small>O tenant atual não possui vínculos ativos além da configuração de sessão.</small></div>
            )}
            {memberError && <div className="import-message danger" style={{ margin: "0 20px 18px" }}><Icon name="warning" /><div><strong>Não foi possível atualizar</strong><small>{memberError}</small></div></div>}

            {canManageTeam && (
              <div className="team-invite">
                <h3>Convidar membro</h3>
                <p>Cria o acesso na hora. Ainda não envia e-mail de verdade — copie a senha temporária e repasse por um canal seguro.</p>
                <div className="team-invite-grid">
                  <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Nome" disabled={inviting} />
                  <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="E-mail" type="email" disabled={inviting} />
                  <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} disabled={inviting}>
                    {invitableRoles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                  </select>
                  <button type="button" className="button secondary" disabled={inviting || !inviteName.trim() || !inviteEmail.trim()} onClick={() => void inviteMember()}>{inviting ? "Convidando…" : "Convidar"}</button>
                </div>
                {inviteError && <div className="import-message danger"><Icon name="warning" /><div><strong>Não foi possível convidar</strong><small>{inviteError}</small></div></div>}
                {inviteResult && (
                  inviteResult.password ? (
                    <div className="import-message success"><Icon name="check" /><div><strong>Conta criada para {inviteResult.email}</strong><small>Senha temporária (mostrada só agora, copie e envie por um canal seguro): <code>{inviteResult.password}</code></small></div></div>
                  ) : (
                    <div className="import-message"><Icon name="shield" /><div><strong>{inviteResult.email} já tinha conta</strong><small>Vínculo criado com esta empresa; a pessoa continua usando a senha que já tinha.</small></div></div>
                  )
                )}
              </div>
            )}

            <div className="team-invite">
              <h3>Minha conta</h3>
              <p>Alterar a própria senha de acesso.</p>
              <div className="team-invite-grid password-grid">
                <input value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Senha atual" type="password" disabled={changingPassword} />
                <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Nova senha (mín. 10 caracteres)" type="password" disabled={changingPassword} />
                <input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirmar nova senha" type="password" disabled={changingPassword} />
                <button type="button" className="button secondary" disabled={changingPassword || !currentPassword || !newPassword} onClick={() => void submitPasswordChange()}>{changingPassword ? "Salvando…" : "Alterar senha"}</button>
              </div>
              {passwordError && <div className="import-message danger"><Icon name="warning" /><div><strong>Não foi possível alterar</strong><small>{passwordError}</small></div></div>}
              {passwordSuccess && <div className="import-message success"><Icon name="check" /><div><strong>Senha alterada com sucesso</strong><small>Use a nova senha no próximo login.</small></div></div>}
            </div>

            <div className="team-invite">
              <h3>Verificação em duas etapas</h3>
              <p>Exige um código do seu celular (Google Authenticator, Authy ou similar) além da senha para entrar na conta.</p>

              {backupCodes && (
                <div className="import-message success">
                  <Icon name="shield" />
                  <div>
                    <strong>2FA ativado. Guarde estes códigos de backup em local seguro:</strong>
                    <small>Cada um funciona uma única vez, caso você perca acesso ao aplicativo autenticador. Eles não serão mostrados de novo.</small>
                    <div className="backup-codes-grid">{backupCodes.map((code) => <code key={code}>{code}</code>)}</div>
                    <button type="button" className="button secondary" onClick={() => setBackupCodes(null)}>Já guardei, fechar</button>
                  </div>
                </div>
              )}

              {!backupCodes && twoFactorEnabled && !showDisableForm && (
                <div className="import-message"><Icon name="shield" /><div><strong>Verificação em duas etapas está ativada</strong><small>Sua conta exige o código do aplicativo autenticador a cada login.</small></div><button type="button" className="button secondary" onClick={() => setShowDisableForm(true)}>Desativar</button></div>
              )}

              {!backupCodes && twoFactorEnabled && showDisableForm && (
                <div className="team-invite-grid password-grid">
                  <input value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} placeholder="Confirme sua senha" type="password" disabled={twoFactorBusy} />
                  <button type="button" className="button secondary" disabled={twoFactorBusy || !disablePassword} onClick={() => void disableTwoFactorSubmit()}>{twoFactorBusy ? "Desativando…" : "Confirmar e desativar"}</button>
                  <button type="button" className="button tiny" onClick={() => { setShowDisableForm(false); setDisablePassword(""); setTwoFactorError(""); }}>Cancelar</button>
                </div>
              )}

              {!backupCodes && !twoFactorEnabled && !twoFactorSetup && (
                <button type="button" className="button secondary" disabled={twoFactorBusy} onClick={() => void startTwoFactorSetup()}>{twoFactorBusy ? "Gerando…" : "Ativar verificação em duas etapas"}</button>
              )}

              {!backupCodes && !twoFactorEnabled && twoFactorSetup && (
                <div className="two-factor-setup">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={twoFactorSetup.qrCodeDataUrl} alt="QR Code para configurar o autenticador" width={180} height={180} />
                  <div>
                    <p>Escaneie com o aplicativo autenticador, ou digite manualmente: <code>{twoFactorSetup.secret}</code></p>
                    <div className="team-invite-grid password-grid">
                      <input value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value)} placeholder="Código de 6 dígitos" inputMode="numeric" disabled={twoFactorBusy} />
                      <button type="button" className="button secondary" disabled={twoFactorBusy || twoFactorCode.length < 6} onClick={() => void confirmTwoFactorSetup()}>{twoFactorBusy ? "Confirmando…" : "Confirmar e ativar"}</button>
                      <button type="button" className="button tiny" onClick={() => { setTwoFactorSetup(null); setTwoFactorCode(""); setTwoFactorError(""); }}>Cancelar</button>
                    </div>
                  </div>
                </div>
              )}

              {twoFactorError && <div className="import-message danger"><Icon name="warning" /><div><strong>Não foi possível concluir</strong><small>{twoFactorError}</small></div></div>}
            </div>
          </>
        )}

        {tab === "labs" && (
          <>
            <div className="card-header"><div><span className="eyebrow">CADASTRO REAL</span><h2>Laboratórios</h2></div><span className="field-ops-count">{laboratories.length}</span></div>
            {laboratories.length ? (
              <div className="data-card">
                <table className="data-table">
                  <thead><tr><th>Nome</th><th>CNPJ/CPF</th><th>Situação</th>{canManageLabs && <th></th>}</tr></thead>
                  <tbody>{laboratories.map((lab) => editingLabId === lab.id ? (
                    <tr key={lab.id}>
                      <td colSpan={2}>
                        <input value={editLabName} onChange={(e) => setEditLabName(e.target.value)} placeholder="Nome" style={{ marginRight: 8 }} />
                        <input value={editLabTaxId} onChange={(e) => setEditLabTaxId(e.target.value)} placeholder="CNPJ/CPF" />
                      </td>
                      <td><StatusBadge tone={lab.active ? "success" : "waiting"}>{lab.active ? "Ativo" : "Inativo"}</StatusBadge></td>
                      <td className="client-row-actions">
                        <button type="button" className="icon-button" disabled={labBusy === `save-${lab.id}`} onClick={() => void saveLab(lab.id)}><Icon name="check" size={15} /></button>
                        <button type="button" className="icon-button" onClick={() => setEditingLabId("")}><Icon name="close" size={15} /></button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={lab.id}>
                      <td><strong>{lab.name}</strong></td>
                      <td>{lab.taxId || "—"}</td>
                      <td><StatusBadge tone={lab.active ? "success" : "waiting"}>{lab.active ? "Ativo" : "Inativo"}</StatusBadge></td>
                      {canManageLabs && (
                        <td className="client-row-actions">
                          <button type="button" className="icon-button" aria-label={`Editar ${lab.name}`} onClick={() => startEditLab(lab)}><Icon name="edit" size={15} /></button>
                          <button type="button" className="button tiny" disabled={labBusy === `active-${lab.id}`} onClick={() => void toggleLabActive(lab)}>{labBusy === `active-${lab.id}` ? "…" : lab.active ? "Desativar" : "Reativar"}</button>
                        </td>
                      )}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state"><Icon name="flask" /><strong>Nenhum laboratório cadastrado</strong><small>Cadastre abaixo, ou direto na tela de nova análise.</small></div>
            )}
            {canManageLabs && (
              <div className="new-lab-inline" style={{ margin: "0 20px 18px" }}>
                <input value={newLabName} onChange={(event) => setNewLabName(event.target.value)} placeholder="Nome do laboratório" disabled={creatingLab} />
                <button type="button" className="button secondary" disabled={creatingLab || !newLabName.trim()} onClick={() => void createLaboratory()}>{creatingLab ? "Salvando…" : "Cadastrar"}</button>
              </div>
            )}
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
