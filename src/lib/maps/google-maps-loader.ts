"use client";

type GoogleMapsNamespace = Record<string, any>;
type GoogleMapsFailureListener = (error: Error) => void;

type GoogleWindow = Window & {
  google?: { maps?: GoogleMapsNamespace };
  gm_authFailure?: () => void;
  [key: string]: unknown;
};

export const GOOGLE_MAPS_LOAD_TIMEOUT_MS = 15_000;
export const GOOGLE_MAPS_TILE_HEALTH_TIMEOUT_MS = 12_000;

let loadPromise: Promise<GoogleMapsNamespace> | null = null;
let authFailureHookInstalled = false;
let authFailureLatched = false;
const authFailureListeners = new Set<GoogleMapsFailureListener>();

export function googleMapsBrowserKey(): string {
  return (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "").trim();
}

export function hasGoogleMapsBrowserKey(): boolean {
  return googleMapsBrowserKey().length > 0;
}

/**
 * A namespace global pode continuar existindo depois de `gm_authFailure`. Nessa situação reutilizar
 * `window.google.maps` faria uma nova montagem voltar para uma API cuja chave já foi rejeitada.
 * Este contrato puro fica separado para que a regressão seja testável fora do browser.
 */
export function shouldReuseLoadedGoogleMaps(namespaceReady: boolean, authenticationFailed: boolean): boolean {
  return namespaceReady && !authenticationFailed;
}

function googleMapsAuthenticationError() {
  return new Error("Google Maps rejeitou a autenticação da chave ou a configuração de billing/API nesta sessão; usando contingência até a página ser recarregada após a correção da configuração.");
}

function ensureGoogleMapsAuthFailureHook() {
  if (typeof window === "undefined" || authFailureHookInstalled) return;
  const browserWindow = window as unknown as GoogleWindow;
  const previous = typeof browserWindow.gm_authFailure === "function" ? browserWindow.gm_authFailure.bind(browserWindow) : null;

  browserWindow.gm_authFailure = () => {
    const error = googleMapsAuthenticationError();
    authFailureLatched = true;
    loadPromise = null;
    for (const listener of [...authFailureListeners]) {
      try { listener(error); } catch { /* listener isolado */ }
    }
    try { previous?.(); } catch { /* callback externo não pode quebrar o fallback RAIZ */ }
  };
  authFailureHookInstalled = true;
}

/**
 * Observa falhas de autenticação sinalizadas oficialmente pela Maps JavaScript API.
 * O hook continua ativo depois que o script carregou, porque uma chave pode baixar o JS
 * e ainda assim ser rejeitada por referrer, billing ou restrição de API em runtime.
 */
export function subscribeGoogleMapsAuthFailure(listener: GoogleMapsFailureListener): () => void {
  if (typeof window === "undefined") return () => {};
  ensureGoogleMapsAuthFailureHook();
  authFailureListeners.add(listener);
  return () => authFailureListeners.delete(listener);
}

/**
 * Carrega a Maps JavaScript API somente no browser e somente uma vez.
 * A chave NEXT_PUBLIC é deliberadamente pública; em produção ela deve ser restrita
 * por HTTP referrer e limitada à Maps JavaScript API no Google Cloud Console.
 *
 * Falha fechado: erro de rede ou script pendurado libera `loadPromise` para uma futura tentativa.
 * Falha de autenticação é diferente: fica latched pela sessão, porque `window.google.maps` pode continuar
 * presente mesmo depois de a chave ter sido rejeitada. Nesse caso novas montagens permanecem em OSM até
 * recarregar a página depois de corrigir chave/referrer/billing.
 */
export function loadGoogleMaps(): Promise<GoogleMapsNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("Google Maps só pode ser carregado no navegador."));
  const browserWindow = window as unknown as GoogleWindow;
  ensureGoogleMapsAuthFailureHook();

  if (authFailureLatched) return Promise.reject(googleMapsAuthenticationError());
  if (shouldReuseLoadedGoogleMaps(Boolean(browserWindow.google?.maps?.Map), authFailureLatched)) {
    return Promise.resolve(browserWindow.google!.maps!);
  }
  if (loadPromise) return loadPromise;

  const key = googleMapsBrowserKey();
  if (!key) return Promise.reject(new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY não configurada."));

  loadPromise = new Promise<GoogleMapsNamespace>((resolve, reject) => {
    const callbackName = `__raizGoogleMapsReady_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    script.dataset.raizGoogleMaps = "1";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&language=pt-BR&region=BR&callback=${callbackName}`;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let unsubscribeAuthFailure: () => void = () => {};
    let settled = false;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      unsubscribeAuthFailure();
      try { delete browserWindow[callbackName]; } catch { browserWindow[callbackName] = undefined; }
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      script.remove();
      loadPromise = null;
      reject(error);
    };

    unsubscribeAuthFailure = subscribeGoogleMapsAuthFailure((error) => fail(error));

    browserWindow[callbackName] = () => {
      if (settled) return;
      if (authFailureLatched) {
        fail(googleMapsAuthenticationError());
        return;
      }
      if (!browserWindow.google?.maps?.Map) {
        fail(new Error("Google Maps carregou sem expor a biblioteca de mapas."));
        return;
      }
      settled = true;
      cleanup();
      resolve(browserWindow.google.maps);
    };

    script.onerror = () => fail(new Error("Falha ao carregar a Maps JavaScript API."));
    timeoutId = setTimeout(
      () => fail(new Error("Google Maps excedeu o tempo limite de carregamento; usando contingência.")),
      GOOGLE_MAPS_LOAD_TIMEOUT_MS,
    );

    document.head.append(script);
  });

  return loadPromise;
}
