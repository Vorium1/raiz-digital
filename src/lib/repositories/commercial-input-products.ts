import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";
import {
  normalizeCommercialInputCatalogDraft,
  type CommercialInputCatalogDraft,
  type CommercialInputKind,
} from "@/domain/commercial-input-catalog";
import type { NutrientGuarantees } from "@/domain/commercial-input-engine";

export type CommercialInputProduct = {
  id: string;
  code: string;
  name: string;
  kind: CommercialInputKind;
  guaranteesPercent: NutrientGuarantees;
  prntPercent: number | null;
  pricePerTon: number | null;
  minRateKgPerHa: number | null;
  maxRateKgPerHa: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CommercialInputProductPatch = Partial<CommercialInputCatalogDraft>;

export class CommercialInputProductError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "CommercialInputProductError";
  }
}

function rowToProduct(row: any): CommercialInputProduct {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    kind: row.kind as CommercialInputKind,
    guaranteesPercent: (row.guaranteesPercent ?? {}) as NutrientGuarantees,
    prntPercent: row.prntPercent == null ? null : Number(row.prntPercent),
    pricePerTon: row.pricePerTon == null ? null : Number(row.pricePerTon),
    minRateKgPerHa: row.minRateKgPerHa == null ? null : Number(row.minRateKgPerHa),
    maxRateKgPerHa: row.maxRateKgPerHa == null ? null : Number(row.maxRateKgPerHa),
    active: Boolean(row.active),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

const SELECT_COLUMNS = `
  id::text, code, name, kind,
  guarantees_percent AS "guaranteesPercent",
  prnt_percent::float8 AS "prntPercent",
  price_per_ton::float8 AS "pricePerTon",
  min_rate_kg_ha::float8 AS "minRateKgPerHa",
  max_rate_kg_ha::float8 AS "maxRateKgPerHa",
  active,
  created_at::text AS "createdAt",
  updated_at::text AS "updatedAt"`;

export async function listCommercialInputProducts(tenantId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT ${SELECT_COLUMNS}
       FROM commercial_input_products
       WHERE tenant_id = $1::uuid
       ORDER BY active DESC, name, code`,
      [tenantId],
    );
    return result.rows.map(rowToProduct);
  });
}

export async function createCommercialInputProduct(input: {
  tenantId: string;
  userId: string;
  product: CommercialInputCatalogDraft;
}) {
  let normalized;
  try {
    normalized = normalizeCommercialInputCatalogDraft(input.product);
  } catch (error) {
    throw new CommercialInputProductError(error instanceof Error ? error.message : "Dados do insumo inválidos.");
  }

  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    try {
      const result = await client.query(
        `INSERT INTO commercial_input_products
         (tenant_id, code, name, kind, guarantees_percent, prnt_percent, price_per_ton,
          min_rate_kg_ha, max_rate_kg_ha, active, created_by, updated_by)
         VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11::uuid, $11::uuid)
         RETURNING ${SELECT_COLUMNS}`,
        [
          input.tenantId,
          normalized.code,
          normalized.name,
          normalized.kind,
          JSON.stringify(normalized.guaranteesPercent),
          normalized.prntPercent,
          normalized.pricePerTon,
          normalized.minRateKgPerHa,
          normalized.maxRateKgPerHa,
          normalized.active,
          input.userId,
        ],
      );
      const product = rowToProduct(result.rows[0]);
      await writeAudit(client, {
        tenantId: input.tenantId,
        userId: input.userId,
        action: "COMMERCIAL_INPUT_PRODUCT_CREATED",
        entityType: "commercial_input_product",
        entityId: product.id,
        metadata: { code: product.code, name: product.name, kind: product.kind, snapshot: product },
      });
      return product;
    } catch (error: any) {
      if (error?.code === "23505") throw new CommercialInputProductError(`Já existe um insumo com o código ${normalized.code}.`, 409);
      throw error;
    }
  });
}

export async function updateCommercialInputProduct(input: {
  tenantId: string;
  userId: string;
  productId: string;
  patch: CommercialInputProductPatch;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const currentResult = await client.query(
      `SELECT ${SELECT_COLUMNS}
       FROM commercial_input_products
       WHERE tenant_id = $1::uuid AND id = $2::uuid
       FOR UPDATE`,
      [input.tenantId, input.productId],
    );
    if (!currentResult.rows[0]) throw new CommercialInputProductError("Insumo comercial não encontrado.", 404);
    const current = rowToProduct(currentResult.rows[0]);

    let normalized;
    try {
      normalized = normalizeCommercialInputCatalogDraft({
        code: input.patch.code ?? current.code,
        name: input.patch.name ?? current.name,
        kind: input.patch.kind ?? current.kind,
        guaranteesPercent: input.patch.guaranteesPercent ?? current.guaranteesPercent,
        prntPercent: input.patch.prntPercent !== undefined ? input.patch.prntPercent : current.prntPercent,
        pricePerTon: input.patch.pricePerTon !== undefined ? input.patch.pricePerTon : current.pricePerTon,
        minRateKgPerHa: input.patch.minRateKgPerHa !== undefined ? input.patch.minRateKgPerHa : current.minRateKgPerHa,
        maxRateKgPerHa: input.patch.maxRateKgPerHa !== undefined ? input.patch.maxRateKgPerHa : current.maxRateKgPerHa,
        active: input.patch.active ?? current.active,
      });
    } catch (error) {
      throw new CommercialInputProductError(error instanceof Error ? error.message : "Dados do insumo inválidos.");
    }

    try {
      const result = await client.query(
        `UPDATE commercial_input_products
         SET code = $3,
             name = $4,
             kind = $5,
             guarantees_percent = $6::jsonb,
             prnt_percent = $7,
             price_per_ton = $8,
             min_rate_kg_ha = $9,
             max_rate_kg_ha = $10,
             active = $11,
             updated_by = $12::uuid
         WHERE tenant_id = $1::uuid AND id = $2::uuid
         RETURNING ${SELECT_COLUMNS}`,
        [
          input.tenantId,
          input.productId,
          normalized.code,
          normalized.name,
          normalized.kind,
          JSON.stringify(normalized.guaranteesPercent),
          normalized.prntPercent,
          normalized.pricePerTon,
          normalized.minRateKgPerHa,
          normalized.maxRateKgPerHa,
          normalized.active,
          input.userId,
        ],
      );
      const product = rowToProduct(result.rows[0]);
      const action = current.active !== product.active
        ? (product.active ? "COMMERCIAL_INPUT_PRODUCT_REACTIVATED" : "COMMERCIAL_INPUT_PRODUCT_DEACTIVATED")
        : "COMMERCIAL_INPUT_PRODUCT_UPDATED";
      await writeAudit(client, {
        tenantId: input.tenantId,
        userId: input.userId,
        action,
        entityType: "commercial_input_product",
        entityId: product.id,
        metadata: { before: current, after: product },
      });
      return product;
    } catch (error: any) {
      if (error?.code === "23505") throw new CommercialInputProductError(`Já existe um insumo com o código ${normalized.code}.`, 409);
      throw error;
    }
  });
}
