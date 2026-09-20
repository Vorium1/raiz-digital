/** Runtime health of the 3D element, distinct from successfully loading the JS library. */
export function monitorGoogle3DHealth(
  target: EventTarget,
  onFailure: (error: Error) => void,
  timeoutMs = 20_000,
): () => void {
  let failed = false;
  const fail = () => {
    if (failed) return;
    failed = true;
    clearTimeout(timer);
    onFailure(new Error("Relevo 3D indisponível; abrindo a base topográfica."));
  };
  const steady = (event: Event) => {
    if ((event as Event & { isSteady?: boolean }).isSteady === true) clearTimeout(timer);
  };
  const timer = setTimeout(fail, timeoutMs);
  target.addEventListener("gmp-error", fail);
  target.addEventListener("gmp-map-id-error", fail);
  target.addEventListener("gmp-steadychange", steady);
  return () => {
    failed = true;
    clearTimeout(timer);
    target.removeEventListener("gmp-error", fail);
    target.removeEventListener("gmp-map-id-error", fail);
    target.removeEventListener("gmp-steadychange", steady);
  };
}
