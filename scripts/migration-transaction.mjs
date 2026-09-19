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


/**
 * Cada número de migration identifica uma única etapa de schema.
 * Dois arquivos com o mesmo prefixo (ex.: 039_*) tornam a ordem ambígua e podem
 * produzir bancos diferentes conforme o histórico do ambiente.
 */
export function assertUniqueMigrationNumbers(names) {
  const seen = new Map();
  for (const name of names) {
    const match = /^(\d+)_([A-Za-z0-9_.-]+)\.sql$/.exec(name);
    if (!match) throw new Error(`Nome de migration inválido: ${name}`);
    const number = match[1];
    const previous = seen.get(number);
    if (previous) {
      throw new Error(`Prefixo de migration duplicado ${number}: ${previous} e ${name}`);
    }
    seen.set(number, name);
  }
}
