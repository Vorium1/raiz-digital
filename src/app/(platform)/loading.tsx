import { Icon } from "@/components/icon";

export default function PlatformLoading() {
  return (
    <div className="simple-platform-state" role="status" aria-live="polite">
      <span className="simple-platform-state-icon simple-platform-state-spin"><Icon name="clock" size={22}/></span>
      <strong>Carregando seus dados…</strong>
      <small>O RAIZ está preparando a área sem bloquear o restante do aplicativo.</small>
      <div className="simple-platform-state-lines" aria-hidden="true"><i/><i/><i/></div>
    </div>
  );
}
