"use client";

import { Icon } from "@/components/icon";

export default function PlatformError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="simple-platform-state is-error" role="alert">
      <span className="simple-platform-state-icon"><Icon name="warning" size={22}/></span>
      <strong>Não foi possível abrir esta tela.</strong>
      <small>Se foi uma falha momentânea de conexão, tente novamente. Seus dados não foram apagados.</small>
      <button type="button" onClick={reset}><Icon name="history" size={14}/> Tentar novamente</button>
    </div>
  );
}
