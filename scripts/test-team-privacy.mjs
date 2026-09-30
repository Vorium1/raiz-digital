import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const repository = await read("src/lib/repositories/team.ts");
const route = await read("src/app/api/team/route.ts");
const settings = await read("src/components/settings-tabs.tsx");

assert.doesNotMatch(repository, /metadata:\s*\{[^}]*email:/s);
assert.doesNotMatch(repository, /metadata:\s*\{[^}]*newAccount:/s);
assert.doesNotMatch(route, /return Response\.json\(\{[\s\S]*?createdNewUser[\s\S]*?\}, \{ status: 201 \}\)/);
assert.doesNotMatch(route, /team_invite_email_failed",\s*\{\s*email:/);
assert.match(route, /emailDelivery/);
assert.doesNotMatch(settings, /inviteResult\.createdNewUser/);
assert.match(settings, /não informa se o e-mail já possuía conta na RAIZ/);

console.log("team-privacy: convite não revela existência global da conta nem grava e-mail em metadata de auditoria");
