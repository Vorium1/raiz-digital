"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";
import type { PlatformTenantSummary, PlatformTenantStatus } from "@/lib/repositories/platform-admin";

const STATUS_LABEL: Record<PlatformTenantStatus, string> = {
  ACTIVE: "Ativa",
  BLOCKED: "Bloqueada",
  CANCELED: "Cancelada",
};

export function PlatformTenantManager({ initialTenants }: { initialTenants: PlatformTenantSummary[] }) {
  const [tenants, setTenants] = useState(initialTenants);
  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [adminTenantId, setAdminTenantId] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");

  async function reload() {
    const response = await fetch("/api/platform/tenants", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar a lista.");
    setTenants(data.tenants ?? []);
  }

  async function createTenant() {
    setBusy("create"); setMessage(null);
    try {
      const response = await fetch("/api/platform/tenants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ legalName, tradeName, taxId: taxId || null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar a empresa.");
      setLegalName(""); setTradeName(""); setTaxId("");
      await reload();
      setMessage({ tone: "success", text: "Empresa criada. Agora defina o primeiro administrador." });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao criar empresa." });
    } finally { setBusy(""); }
  }

  async function changeStatus(id: string, status: PlatformTenantStatus) {
    setBusy(`status-${id}`); setMessage(null);
    try {
      const response = await fetch(`/api/platform/tenants/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível alterar a situação.");
      await reload();
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao alterar a situação." });
    } finally { setBusy(""); }
  }

  async function createFirstAdmin() {
    if (!adminTenantId) return;
    setBusy("admin"); setMessage(null);
    try {
      const response = await fetch(`/api/platform/tenants/${adminTenantId}/first-admin`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: adminName, email: adminEmail }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar o administrador.");
      setAdminTenantId(""); setAdminName(""); setAdminEmail("");
      await reload();
      setMessage({
        tone: "success",
        text: data.emailDelivery === "sent"
          ? "Administrador criado e convite enviado."
          : "Administrador criado. O acesso está pronto; verifique a configuração de e-mail para a entrega do convite.",
      });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao criar administrador." });
    } finally { setBusy(""); }
  }

  return (
    <>
      {message && <div className={`import-message ${message.tone}`}><Icon name={message.tone === "success" ? "check" : "warning"} size={16}/><div><strong>{message.tone === "success" ? "Concluído" : "Não foi possível concluir"}</strong><small>{message.text}</small></div></div>}

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><div><span className="eyebrow">NOVA EMPRESA</span><h2>Criar tenant</h2></div></div>
        <div className="review-actions">
          <p className="report-empty-note" style={{ marginTop: 0 }}>A administração da plataforma cria a empresa; os dados operacionais continuam isolados no tenant.</p>
          <div className="review-grid">
            <label className="review-summary"><span>Razão social</span><input value={legalName} onChange={(e) => setLegalName(e.target.value)} /></label>
            <label className="review-summary"><span>Nome da empresa</span><input value={tradeName} onChange={(e) => setTradeName(e.target.value)} /></label>
            <label className="review-summary"><span>CNPJ/CPF</span><input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="Opcional"/></label>
          </div>
          <button className="button primary" disabled={busy !== "" || !legalName.trim() || !tradeName.trim()} onClick={() => void createTenant()}>{busy === "create" ? "Criando…" : "Criar empresa"}</button>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><div><span className="eyebrow">EMPRESAS</span><h2>Tenants da RAIZ Digital</h2></div><span className="field-ops-count">{tenants.length}</span></div>
        {tenants.length === 0 ? <div className="empty-state"><Icon name="users"/><strong>Nenhuma empresa cadastrada.</strong></div> : (
          <div className="data-card">
            <table className="data-table">
              <thead><tr><th>Empresa</th><th>Equipe</th><th>Clientes</th><th>Propriedades</th><th>Talhões</th><th>Situação</th></tr></thead>
              <tbody>{tenants.map((tenant) => <tr key={tenant.id}>
                <td><strong>{tenant.tradeName}</strong><small>{tenant.legalName}</small></td>
                <td>{tenant.activeMembers}</td><td>{tenant.clients}</td><td>{tenant.properties}</td><td>{tenant.fields}</td>
                <td>
                  <div className="review-actions" style={{ margin: 0 }}>
                    <StatusBadge tone={tenant.status === "ACTIVE" ? "success" : "waiting"}>{STATUS_LABEL[tenant.status]}</StatusBadge>
                    <select value={tenant.status} disabled={busy === `status-${tenant.id}`} onChange={(e) => void changeStatus(tenant.id, e.target.value as PlatformTenantStatus)}>
                      <option value="ACTIVE">Ativa</option><option value="BLOCKED">Bloqueada</option><option value="CANCELED">Cancelada</option>
                    </select>
                    {tenant.activeMembers === 0 && <button className="button tiny" onClick={() => { setAdminTenantId(tenant.id); setAdminName(""); setAdminEmail(""); }}>Primeiro administrador</button>}
                  </div>
                </td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      {adminTenantId && <section className="card">
        <div className="card-header"><div><span className="eyebrow">ONBOARDING</span><h2>Primeiro administrador da empresa</h2></div></div>
        <div className="review-actions">
          <p className="report-empty-note" style={{ marginTop: 0 }}>Cria apenas o vínculo administrativo deste tenant. Se o e-mail já existir na RAIZ, a identidade global é reutilizada sem expor outros vínculos.</p>
          <div className="review-grid">
            <label className="review-summary"><span>Nome</span><input value={adminName} onChange={(e) => setAdminName(e.target.value)} /></label>
            <label className="review-summary"><span>E-mail</span><input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} /></label>
          </div>
          <div className="review-actions">
            <button className="button primary" disabled={busy !== "" || !adminName.trim() || !adminEmail.trim()} onClick={() => void createFirstAdmin()}>{busy === "admin" ? "Criando…" : "Criar administrador e enviar convite"}</button>
            <button className="button ghost" disabled={busy !== ""} onClick={() => setAdminTenantId("")}>Cancelar</button>
          </div>
        </div>
      </section>}
    </>
  );
}
