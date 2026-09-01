export type DataMode = "database" | "demo";

export function getDataMode(): DataMode {
  return process.env.DATA_MODE === "demo" ? "demo" : "database";
}

export function isDatabaseMode() {
  return getDataMode() === "database";
}
