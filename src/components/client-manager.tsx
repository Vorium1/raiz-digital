"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";

type Client = {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
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

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(payload.error ?? "Não foi possível cadastrar o cliente.");
      return;
    }
    setClients((current) => [...current, payload.client].sort((a,b) => a.name.localeCompare(b.name, "pt-BR")));
    setShowForm(false);
    event.currentTarget.reset();
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    if (!needle) return clients;
    return clients.filter((client) => [client.name, client.taxId, client.email, client.phone].some((value) => value?.toLocaleLowerCase("pt-BR").includes(needle)));
  }, [clients, query]);

  return <>
    <div className="toolbar">
      <div className="toolbar-left"><label className="search-box"><Icon name="search" size={17}/><input value={query} onChange={(event)=>setQuery(event.target.value)} aria-label="Buscar cliente" placeholder="Buscar nome, documento ou contato"/></label></div>
      <button className="button secondary" type="button" onClick={()=>setShowForm((value)=>!value)}><Icon name={showForm ? "close" : "plus"} size={16}/>{showForm ? "Fechar" : "Novo cliente"}</button>
    </div>

    {showForm && <form className="card inline-create-form" onSubmit={create}>
      <div className="form-heading"><span className="eyebrow">CADASTRO REAL</span><h2>Novo cliente</h2><p>O registro será gravado no PostgreSQL já vinculado ao tenant da sessão.</p></div>
      <div className="form-grid compact">
        <label><span>Nome / razão social *</span><input name="name" required minLength={2} maxLength={160}/></label>
        <label><span>CPF/CNPJ</span><input name="taxId" inputMode="numeric"/></label>
        <label><span>E-mail</span><input name="email" type="email"/></label>
        <label><span>Telefone</span><input name="phone" type="tel"/></label>
      </div>
      <label className="full-field"><span>Observações</span><textarea name="notes" rows={3}/></label>
      <div className="inline-form-footer"><small><Icon name="shield" size={13}/>A criação gera registro de auditoria.</small><button className="button primary" disabled={saving}>{saving ? "Salvando…" : "Salvar cliente"}</button></div>
    </form>}

    {error && <div className="import-message danger"><Icon name="warning" size={16}/><div><strong>Não foi possível concluir</strong><small>{error}</small></div></div>}

    <div className="data-card">
      {loading ? <div className="empty-state"><strong>Carregando carteira…</strong><small>Consultando dados isolados da sua empresa.</small></div> : filtered.length === 0 ? <div className="empty-state"><Icon name="users"/><strong>{clients.length ? "Nenhum cliente encontrado" : "Sua carteira começa aqui"}</strong><small>{clients.length ? "Ajuste a busca para localizar outro cadastro." : "Cadastre o primeiro cliente para depois criar propriedades e talhões."}</small></div> : <table className="data-table"><thead><tr><th>Cliente</th><th>Contato</th><th>Propriedades</th><th>Área acompanhada</th><th>Análises</th><th></th></tr></thead><tbody>{filtered.map((client)=><tr key={client.id}><td><strong>{client.name}</strong><small>{client.taxId || "Documento não informado"}</small></td><td>{client.email || client.phone || "—"}</td><td>{client.properties}</td><td>{client.hectares.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</td><td>{client.analyses}</td><td><Icon name="chevron" size={17}/></td></tr>)}</tbody></table>}
    </div>
  </>;
}
