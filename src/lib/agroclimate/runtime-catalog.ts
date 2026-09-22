import {
  adaptAgroclimateCatalogRows,
  type ActiveAgroclimateCatalogRow,
  type AdaptedAgroclimateCatalog,
} from "@/domain/agroclimate-profile-adapter";
import {
  listActiveAgroclimateProfilesForContext,
  AgroclimateProfileError,
} from "@/lib/repositories/agroclimate-profiles";

export class AgroclimateRuntimeCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgroclimateRuntimeCatalogError";
  }
}

/**
 * Carrega somente perfis ACTIVE + fonte ACTIVE da cultura e regiões técnicas
 * já resolvidas pelo PostGIS/escopo administrativo.
 *
 * Fail-closed: se qualquer perfil ativo não puder ser adaptado para o runtime,
 * o motor climático não recebe um catálogo parcial silenciosamente.
 */
export async function loadAgroclimateRuntimeCatalog(input: {
  tenantId: string;
  userId?: string;
  cropCode: string;
  technicalRegionCodes: string[];
  atDate?: string | null;
}): Promise<AdaptedAgroclimateCatalog> {
  try {
    const rows = await listActiveAgroclimateProfilesForContext({
      tenantId: input.tenantId,
      userId: input.userId,
      cropCode: input.cropCode,
      technicalRegionCodes: input.technicalRegionCodes,
      atDate: input.atDate,
    });

    const adapted = adaptAgroclimateCatalogRows(rows as ActiveAgroclimateCatalogRow[]);
    if (adapted.rejected.length > 0) {
      const details = adapted.rejected
        .map((item) => `${item.profileCode}:${item.reason}`)
        .join(", ");
      throw new AgroclimateRuntimeCatalogError(
        `Existem perfis agroclimáticos ACTIVE incompatíveis com o runtime: ${details}`,
      );
    }

    return adapted;
  } catch (error) {
    if (error instanceof AgroclimateRuntimeCatalogError) throw error;
    if (error instanceof AgroclimateProfileError) {
      throw new AgroclimateRuntimeCatalogError(error.message);
    }
    throw error;
  }
}
