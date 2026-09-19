/**
 * Faz migration + registro em schema_migrations nascerem no MESMO commit PostgreSQL.
 *
 * Alguns arquivos históricos já possuem BEGIN/COMMIT; outros dependem da transação
 * implícita do cliente. Em ambos os casos o ledger precisa ser gravado antes do COMMIT,
 * evitando o estado observado em homologação: schema físico avançado e ledger atrasado.
 */
export function buildAtomicMigrationSql(sql, name) {
  if (typeof sql !== "string" || !sql.trim()) throw new Error("Migration SQL vazia.");
  if (!/^[0-9]+_[A-Za-z0-9_.-]+\.sql$/.test(name)) throw new Error("Nome de migration inválido.");

  const trimmed = sql.trim();
  const startsTransaction = /^BEGIN\s*;/i.test(trimmed);
  const endsTransaction = /COMMIT\s*;$/i.test(trimmed);

  if (startsTransaction !== endsTransaction) {
    throw new Error(`Migration ${name} possui wrapper transacional incompleto.`);
  }

  const escapedName = name.replaceAll("'", "''");
  const ledger = `INSERT INTO schema_migrations(name) VALUES ('${escapedName}');`;

  if (startsTransaction) {
    return trimmed.replace(/COMMIT\s*;$/i, `${ledger}\n\nCOMMIT;`);
  }

  return `BEGIN;\n\n${trimmed}\n\n${ledger}\n\nCOMMIT;`;
}
