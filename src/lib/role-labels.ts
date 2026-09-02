export const roleLabel: Record<string, string> = {
  SUPER_ADMIN: "Administrador global",
  TENANT_ADMIN: "Administrador",
  AGRONOMIST: "Agrônomo",
  FIELD_TECH: "Técnico de campo",
  COMMERCIAL: "Comercial",
  VIEWER: "Leitura",
};

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase();
}
