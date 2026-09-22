export type DataMode = "database" | "demo";

/**
 * Dados demo são permitidos apenas em desenvolvimento local.
 *
 * Preview/Vercel e qualquer build NODE_ENV=production sempre usam o banco real,
 * mesmo que uma variável DATA_MODE=demo antiga ainda exista no ambiente.
 * Isso evita que fixtures históricas apareçam misturadas aos dados Cabeda.
 */
export function getDataMode(): DataMode {
  const localDemo = process.env.NODE_ENV !== "production" && process.env.DATA_MODE === "demo";
  return localDemo ? "demo" : "database";
}

export function isDatabaseMode() {
  return getDataMode() === "database";
}
