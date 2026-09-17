import { notFound } from "next/navigation";
import { requirePlatformSession } from "@/lib/auth/session";
import { getFieldOverview } from "@/lib/repositories/field-overview";
import { listOperationalAlerts } from "@/lib/repositories/alerts";
import { SimpleFieldOverview } from "@/components/simple-field-overview";

export const metadata = { title: "Talhão" };

export default async function FieldOverviewPage({ params }: { params: Promise<{ fieldId: string }> }) {
  const { fieldId } = await params;
  const session = await requirePlatformSession();
  const overview = await getFieldOverview(session.tenantId, fieldId, session.userId);
  if (!overview) notFound();

  const alerts = (await listOperationalAlerts(session.tenantId, session.userId)).filter((alert) => alert.fieldId === fieldId);

  return (
    <div className="simple-field-shell">
      <SimpleFieldOverview overview={overview} alerts={alerts}/>
    </div>
  );
}
