import { isDatabaseMode } from "@/lib/data-mode";
import { query } from "@/lib/db";

export async function GET() {
  const mode = isDatabaseMode() ? "database" : "demo";
  if (mode === "demo") {
    return Response.json({ status: "healthy", service: "raiz-digital", mode, database: "not_required", timestamp: new Date().toISOString() });
  }

  try {
    await query("SELECT 1 AS ok");
    return Response.json({ status: "healthy", service: "raiz-digital", mode, database: "connected", timestamp: new Date().toISOString() });
  } catch {
    return Response.json({ status: "degraded", service: "raiz-digital", mode, database: "unavailable", timestamp: new Date().toISOString() }, { status: 503 });
  }
}
