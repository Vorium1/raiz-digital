const municipalityCode = "4300059";
const url = `https://apisidra.ibge.gov.br/values/t/5457/n6/${municipalityCode}/v/112/p/last%2010/c782/40124?formato=json`;
const response = await fetch(url, { headers: { accept: "application/json" } });
if (!response.ok) throw new Error(`SIDRA HTTP ${response.status}`);
const rows = await response.json();
if (!Array.isArray(rows) || rows.length < 2) throw new Error("SIDRA não retornou série municipal utilizável.");
const data = rows.filter((row) => Number.isFinite(Number(String(row.V ?? "").replace(",", "."))));
if (data.length < 3) throw new Error(`SIDRA retornou apenas ${data.length} observações numéricas.`);
console.log(JSON.stringify({ source: "IBGE/PAM SIDRA 5457", municipalityCode, observations: data.length }, null, 2));
