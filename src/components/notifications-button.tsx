"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { auditActionLabel, auditEntityLabel } from "@/lib/audit-labels";
import { formatRelativeOrDate } from "@/domain/analysis-ui";

type AuditEvent = { id: string; action: string; entityType: string; createdAt: string; actorName: string | null };

const LAST_SEEN_KEY = "raiz:notifications:lastSeen";

export function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [hasUnseen, setHasUnseen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        const list = (payload.events ?? []) as AuditEvent[];
        setEvents(list);
        const lastSeen = window.localStorage.getItem(LAST_SEEN_KEY);
        const newest = list[0]?.createdAt;
        setHasUnseen(Boolean(newest && (!lastSeen || new Date(newest) > new Date(lastSeen))));
      })
      .catch(() => setEvents([]));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  function toggle() {
    setOpen((current) => {
      const next = !current;
      if (next) {
        window.localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
        setHasUnseen(false);
      }
      return next;
    });
  }

  return (
    <div className="notifications" ref={containerRef}>
      <button type="button" className="icon-button notification-button" aria-label="Abrir notificações" aria-expanded={open} onClick={toggle}>
        <Icon name="bell"/>{hasUnseen && <i aria-hidden="true"/>}
      </button>
      {open && (
        <div className="notifications-panel">
          <div className="notifications-header">Atividade recente</div>
          {events === null ? (
            <div className="notifications-empty">Carregando…</div>
          ) : events.length === 0 ? (
            <div className="notifications-empty">Nenhuma atividade registrada ainda.</div>
          ) : (
            <ul>
              {events.map((event) => (
                <li key={event.id}>
                  <strong>{auditActionLabel[event.action] ?? event.action}</strong>
                  <span>{auditEntityLabel[event.entityType] ?? event.entityType} · {event.actorName ?? "Sistema"}</span>
                  <small>{formatRelativeOrDate(event.createdAt)}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
