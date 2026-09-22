/** Runtime health of the 3D element, distinct from successfully loading the JS library. */
export function monitorGoogle3DHealth(
  target: EventTarget,
  onFailure: (error: Error) => void,
  timeoutMs = 15_000,
  onReady: () => void = () => {},
): () => void {
  let failed = false;
  let ready = false;

  const fail = () => {
    if (failed) return;
    failed = true;
    clearTimeout(timer);
    onFailure(new Error("Relevo 3D indisponível; abrindo a base topográfica."));
  };

  const steady = (event: Event) => {
    if ((event as Event & { isSteady?: boolean }).isSteady !== true || ready || failed) return;
    ready = true;
    clearTimeout(timer);
    onReady();
  };

  const timer = setTimeout(fail, timeoutMs);
  target.addEventListener("gmp-error", fail);
  target.addEventListener("gmp-map-id-error", fail);
  target.addEventListener("gmp-steadychange", steady);
  // A documentação de boas práticas usa gmp-steadystate enquanto a referência versionada
  // ainda expõe gmp-steadychange. Escutamos ambos e tratamos readiness uma única vez.
  target.addEventListener("gmp-steadystate", steady);

  return () => {
    failed = true;
    clearTimeout(timer);
    target.removeEventListener("gmp-error", fail);
    target.removeEventListener("gmp-map-id-error", fail);
    target.removeEventListener("gmp-steadychange", steady);
    target.removeEventListener("gmp-steadystate", steady);
  };
}
