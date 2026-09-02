import { defineConfig } from "@playwright/test";

// Testes de ponta a ponta contra o banco real (DATA_MODE=database). Exigem um `npm run dev`
// já rodando com o .env configurado, e as contas de teste descritas em e2e/README.md.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
});
