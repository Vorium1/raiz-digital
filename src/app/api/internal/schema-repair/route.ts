import { NextResponse } from "next/server";
import { getPlatformSession } from "@/lib/auth/session";
import { repairSchema035to037 } from "@/lib/admin/schema-repair";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }
  if (!session.isPlatformCurator) {
    return Response.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const result = await repairSchema035to037();
  if (!result.ok) {
    const url = new URL("/operacao-sistema/schema-repair", request.url);
    url.searchParams.set("error", result.errorCode ?? "SCHEMA_REPAIR_FAILED");
    return NextResponse.redirect(url, 303);
  }

  const url = new URL("/dashboard", request.url);
  url.searchParams.set("schemaRepair", "ok");
  return NextResponse.redirect(url, 303);
}
