import { requirePlatformSession } from "@/lib/auth/session";
import { listPlanningScenarios } from "@/lib/repositories/planning";
import { listAgronomicContext } from "@/lib/repositories/catalog";
import { PlanningWorkspace } from "@/components/planning-workspace";
export const metadata={title:"Planejamento plurissafras"};
export default async function PlanningPage(){const s=await requirePlatformSession();const [scenarios,context]=await Promise.all([listPlanningScenarios(s.tenantId,s.userId),listAgronomicContext(s.tenantId,s.userId)]);return <PlanningWorkspace fields={context.fields} initial={scenarios}/>;}
