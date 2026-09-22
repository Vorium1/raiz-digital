"use client";

type MapboxNamespace = {
  accessToken: string;
  Map: new (options: Record<string, unknown>) => any;
  NavigationControl: new (options?: Record<string, unknown>) => any;
  Popup: new (options?: Record<string, unknown>) => any;
};

type MapboxWindow = Window & { mapboxgl?: MapboxNamespace };

export const MAPBOX_GL_VERSION = "3.30.0";
export const MAPBOX_LOAD_TIMEOUT_MS = 15_000;

let loadPromise: Promise<MapboxNamespace> | null = null;

export function mapboxBrowserToken(): string {
  return (process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "").trim();
}

export function hasMapboxBrowserToken(): boolean {
  return mapboxBrowserToken().length > 0;
}

export function loadMapboxGl(): Promise<MapboxNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("Mapbox GL JS só pode ser carregado no navegador."));
  const browserWindow = window as MapboxWindow;
  if (browserWindow.mapboxgl?.Map) return Promise.resolve(browserWindow.mapboxgl);
  if (loadPromise) return loadPromise;

  const token = mapboxBrowserToken();
  if (!token) return Promise.reject(new Error("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN não configurado."));

  loadPromise = new Promise<MapboxNamespace>((resolve, reject) => {
    const cssHref = `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_GL_VERSION}/mapbox-gl.css`;
    const jsSrc = `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_GL_VERSION}/mapbox-gl.js`;

    if (!document.querySelector(`link[data-raiz-mapbox-css="1"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = cssHref;
      link.dataset.raizMapboxCss = "1";
      document.head.appendChild(link);
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[data-raiz-mapbox="1"]`);
    const script = existing ?? document.createElement("script");
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };

    const onLoad = () => {
      cleanup();
      if (!browserWindow.mapboxgl?.Map) {
        loadPromise = null;
        reject(new Error("Mapbox GL JS carregou sem expor a biblioteca."));
        return;
      }
      browserWindow.mapboxgl.accessToken = token;
      resolve(browserWindow.mapboxgl);
    };

    const onError = () => {
      cleanup();
      loadPromise = null;
      reject(new Error("Falha ao carregar Mapbox GL JS."));
    };

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });

    if (!existing) {
      script.src = jsSrc;
      script.async = true;
      script.defer = true;
      script.dataset.raizMapbox = "1";
      document.head.appendChild(script);
    }

    timeoutId = setTimeout(() => {
      cleanup();
      loadPromise = null;
      reject(new Error("Mapbox GL JS excedeu o tempo limite de carregamento."));
    }, MAPBOX_LOAD_TIMEOUT_MS);

    if (existing && browserWindow.mapboxgl?.Map) onLoad();
  });

  return loadPromise;
}
