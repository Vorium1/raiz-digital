"use client";

type GoogleMapsNamespace = Record<string, any>;

type GoogleWindow = Window & {
  google?: { maps?: GoogleMapsNamespace };
  [key: string]: unknown;
};

let loadPromise: Promise<GoogleMapsNamespace> | null = null;

export function googleMapsBrowserKey(): string {
  return (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "").trim();
}

export function hasGoogleMapsBrowserKey(): boolean {
  return googleMapsBrowserKey().length > 0;
}

/**
 * Carrega a Maps JavaScript API somente no browser e somente uma vez.
 * A chave NEXT_PUBLIC é deliberadamente pública; em produção ela deve ser restrita
 * por HTTP referrer e limitada à Maps JavaScript API no Google Cloud Console.
 */
export function loadGoogleMaps(): Promise<GoogleMapsNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("Google Maps só pode ser carregado no navegador."));
  const browserWindow = window as unknown as GoogleWindow;
  if (browserWindow.google?.maps?.Map) return Promise.resolve(browserWindow.google.maps);
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

    const cleanup = () => {
      try { delete browserWindow[callbackName]; } catch { browserWindow[callbackName] = undefined; }
    };

    browserWindow[callbackName] = () => {
      cleanup();
      if (!browserWindow.google?.maps?.Map) {
        loadPromise = null;
        reject(new Error("Google Maps carregou sem expor a biblioteca de mapas."));
        return;
      }
      resolve(browserWindow.google.maps);
    };

    script.onerror = () => {
      cleanup();
      script.remove();
      loadPromise = null;
      reject(new Error("Falha ao carregar a Maps JavaScript API."));
    };

    document.head.append(script);
  });

  return loadPromise;
}
