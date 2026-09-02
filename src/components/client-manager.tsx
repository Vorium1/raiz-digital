"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";

type Client = {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  notes?: string | null;
  properties: number;
  hectares: number;
  analyses: number;
};

export function ClientManager() {
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/clients", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setError(payload.error ?? "Não foi possível carregar os clientes.");
      return;
    }
    setClients(payload.clients ?? []);
  }

  useEffect(() => { void load(); }, []);

  function startCreate() {
    setEditingClient(null);
    setShowForm((value) => !value);
  }

  function startEdit(client: Client) {
    setEditingClient(client);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingClient(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    const isEdit = Boolean(editingClient);
    const response = await fetch(isEdit ? `/api/clients/${editingClient!.id}` : "/api/clients", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(payload.error ?? "Não foi possível salvar o cliente.");
      return;
    }
    if (isEdit) {
      setClients((current) => current.map((item) => (item.id === payload.client.id ? { ...item, ...payload.client } : item)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
    } else {
      setClients((current) => [...current, payload.client].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
    }
    closeForm();
    event.currentTarget.reset();
  }

  async function remove(client: Client) {
    if (!window.confirm(`Excluir o cliente "${client.name}"? Essa ação não pode ser desfeita.`)) return;
    setDeletingId(client.id);
    setError("");
    const response = await fetch(`/api/clients/${client.id}`, { method: "DELETE" });
    const payload = await response.json().catch(() => ({}));
    setDeletingId("");
    if (!response.ok) {
      setError(payload.error ?? "Não foi possível excluir o cliente.");
      return;
    }
    setClients((current) => current.filter((item) => item.id !== client.id));
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    if (!needle) return clients;
    return clients.filter((client) => [client.name, client.taxId, client.email, client.phone].some((value) => value?.toLocaleLowerCase("pt-BR").includes(needle)));
  }, [clients, query]);

  return <>
    <div className="toolbar">
      <div className="toolbar-left"><label className="search-box"><Icon name="search" size={17}/><input value={query} onChange={(event)=>setQuery(event.target.value)} aria-label="Buscar cliente" placeholder="Buscar nome, documento ou contato"/></label></div>
      <button className="button secondary" type="button" onClick={startCreate}><Icon name={showForm && !editingClient ? "close" : "plus"} size={16}/>{showForm && !editingClient ? "Fechar" : "Novo cliente"}</button>
    </div>

    {showForm && <form className="card inline-create-form" onSubmit={submit} key={editingClient?.id ?? "new"}>
      <div className="form-heading"><span className="eyebrow">{editingClient ? "EDIÇÃO" : "CADASTRO REAL"}</span><h2>{editingClient ? `Editar ${editingClient.name}` : "Novo cliente"}</h2><p>{editingClient ? "As mudanças são gravadas no PostgreSQL na hora." : "O registro será gravado no PostgreSQL já vinculado ao tenant da sessão."}</p></div>
      <div className="form-grid compact">
        <label><span>Nome / razão social *</span><input name="name" required minLength={2} maxLength={160} defaultValue={editingClient?.name ?? ""}/></label>
        <label><span>CPF/CNPJ</span><input name="taxId" inputMode="numeric" defaultValue={editingClient?.taxId ?? ""}/></label>
        <label><span>E-mail</span><input name="email" type="email" defaultValue={editingClient?.email ?? ""}/></label>
        <label><span>Telefone</span><input name="phone" type="tel" defaultValue={editingClient?.phone ?? ""}/></label>
      </div>
      <label className="full-field"><span>Observações</span><textarea name="notes" rows={3} defaultValue={editingClient?.notes ?? ""}/></label>
      <div className="inline-form-footer">
        <small><Icon name="shield" size={13}/>{editingClient ? "A edição gera registro de auditoria." : "A criação gera registro de auditoria."}</small>
        <div style={{ display: "flex", gap: 10 }}>
          {editingClient && <button type="button" className="button ghost" onClick={closeForm}>Cancelar</button>}
          <button className="button primary" disabled={saving}>{saving ? "Salvando…" : editingClient ? "Salvar alterações" : "Salvar cliente"}</button>
        </div>
      </div>
    </form>}

    {error && <div className="import-message danger"><Icon name="warning" size={16}/><div><strong>Não foi possível concluir</strong><small>{error}</small></div></div>}

    <div className="data-card">
      {loading ? <div className="empty-state"><strong>Carregando carteira…</strong><small>Consultando dados isolados da sua empresa.</small></div> : filtered.length === 0 ? <div className="empty-state"><Icon name="users"/><strong>{clients.length ? "Nenhum cliente encontrado" : "Sua carteira começa aqui"}</strong><small>{clients.length ? "Ajuste a busca para localizar outro cadastro." : "Cadastre o primeiro cliente para depois criar propriedades e talhões."}</small></div> : <table className="data-table"><thead><tr><th>Cliente</th><th>Contato</th><th>Propriedades</th><th>Área acompanhada</th><th>Análises</th><th></th></tr></thead><tbody>{filtered.map((client)=><tr key={client.id}><td><strong>{client.name}</strong><small>{client.taxId || "Documento não informado"}</small></td><td>{client.email || client.phone || "—"}</td><td>{client.properties}</td><td>{client.hectares.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</td><td>{client.analyses}</td><td className="client-row-actions"><button type="button" className="icon-button" aria-label={`Editar ${client.name}`} onClick={()=>startEdit(client)}><Icon name="edit" size={15}/></button><button type="button" className="icon-button" aria-label={`Excluir ${client.name}`} disabled={deletingId === client.id} onClick={()=>void remove(client)}><Icon name={deletingId === client.id ? "clock" : "trash"} size={15}/></button></td></tr>)}</tbody></table>}
    </div>
  </>;
}
