import { repairSchema035to037 } from "../src/lib/admin/schema-repair.ts";

const result = await repairSchema035to037();
console.log(JSON.stringify({
  ok: result.ok,
  repairedMigrations: result.repairedMigrations,
  missingAfter: result.missingAfter,
  errorCode: result.errorCode,
}, null, 2));

if (!result.ok) process.exit(1);
