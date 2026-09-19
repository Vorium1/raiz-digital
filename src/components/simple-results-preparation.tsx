"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

type Item = { id: string; fieldName: string; reason: string | null };

export function SimpleResultsPreparation({
  items,
  canRefresh,
  canPublish,
}: {
  items: Item[];
  canRefresh: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function prepare(item: Item, automatic = false) {
    if (!canRefresh) return false;
    setBusyIds((current) => current.includes(item.id) ? current : [...current, item.id]);
    setErrors((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    try {
      const response = await fetch(`/api/analyses/${item.id}/interpret?draft=local`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível atualizar esta análise.");
      return true;
    } catch (caught) {
      setErrors((current) => ({
        ...current,
        [item.id]: caught instanceof Error ? caught.message : "Não foi possível atualizar esta análise.",
      }));
      if (automatic) sessionStorage.removeItem(`raiz:ux3:results-refresh:${item.id}`);
      return false;
    } finally {
      setBusyIds((current) => current.filter((id) => id !== item.id));
    }
  }

  async function updateOfficial(item: Item) {
    if (!canPublish) return;
    setBusyIds((current) => current.includes(item.id) ? current : [...current, item.id]);
    setErrors((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    try {
      const response = await fetch(`/api/analyses/${item.id}/official-result`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível atualizar o laudo RAIZ.");
      router.refresh();
    } catch (caught) {
      setErrors((current) => ({
        ...current,
        [item.id]: caught instanceof Error ? caught.message : "Não foi possível atualizar o laudo RAIZ.",
      }));
    } finally {
      setBusyIds((current) => current.filter((id) => id !== item.id));
    }
  }

  useEffect(() => {
    if (!canRefresh || items.length === 0) return;
    let cancelled = false;
    void (async () => {
      let changed = false;
      for (const item of items) {
        if (cancelled) return;
        const key = `raiz:ux3:results-refresh:${item.id}`;
        if (sessionStorage.getItem(key)) continue;
        sessionStorage.setItem(key, "1");
        changed = (await prepare(item, true)) || changed;
      }
      if (!cancelled && changed) router.refresh();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRefresh, items.map((item) => item.id).join("|")]);

  if (items.length === 0) return null;

  return (
    <section className="simple-results-section">
      <div className="simple-results-section-head">
        <span>ATUALIZANDO</span>
        <h2>A RAIZ está preparando estas conclusões</h2>
<p>Os dados já existem. A RAIZ recalcula com a base técnica atual; a versão oficial antiga permanece congelada até você escolher atualizar o laudo.</p>
      </div>
      <div className="simple-results-grid">
        {items.map((item) => {
          const busy = busyIds.includes(item.id);
          const error = errors[item.id];
          return (
            <article className="simple-result-card preparing" key={item.id}>
              <span className="simple-result-icon"><Icon name={error ? "warning" : "clock"} size={23}/></span>
              <div>
                <strong>{item.fieldName}</strong>
                <small>{error ?? (busy ? "Atualizando análise e preparando a conclusão…" : item.reason ?? "Análise precisa ser atualizada.")}</small>
              </div>
              {canPublish && !busy && (
                <button type="button" onClick={() => void updateOfficial(item)}>
                  Atualizar laudo
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
