-- Fecha a cadeia de custódia do raster NDVI: snapshots novos passam a poder apontar para um PNG
-- durável/content-addressed, com hash, bbox, dimensões e versão do algoritmo. Linhas antigas ficam
-- válidas com todos os campos nulos até serem atualizadas explicitamente pelo fluxo de refresh.

ALTER TABLE field_ndvi_snapshots
  ADD COLUMN raster_object_key text,
  ADD COLUMN raster_sha256 text,
  ADD COLUMN raster_bytes integer,
  ADD COLUMN raster_bbox jsonb,
  ADD COLUMN raster_width integer,
  ADD COLUMN raster_height integer,
  ADD COLUMN raster_algorithm text,
  ADD COLUMN raster_mosaicking_order text,
  ADD COLUMN raster_archived_at timestamptz;

ALTER TABLE field_ndvi_snapshots
  ADD CONSTRAINT field_ndvi_raster_sha256_format
    CHECK (raster_sha256 IS NULL OR raster_sha256 ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT field_ndvi_raster_bytes_positive
    CHECK (raster_bytes IS NULL OR raster_bytes > 0),
  ADD CONSTRAINT field_ndvi_raster_dimensions_positive
    CHECK ((raster_width IS NULL AND raster_height IS NULL) OR (raster_width > 0 AND raster_height > 0)),
  ADD CONSTRAINT field_ndvi_raster_bbox_shape
    CHECK (raster_bbox IS NULL OR (jsonb_typeof(raster_bbox) = 'array' AND jsonb_array_length(raster_bbox) = 4)),
  ADD CONSTRAINT field_ndvi_raster_metadata_all_or_none
    CHECK (
      (raster_object_key IS NULL AND raster_sha256 IS NULL AND raster_bytes IS NULL AND raster_bbox IS NULL
       AND raster_width IS NULL AND raster_height IS NULL AND raster_algorithm IS NULL
       AND raster_mosaicking_order IS NULL AND raster_archived_at IS NULL)
      OR
      (raster_object_key IS NOT NULL AND raster_sha256 IS NOT NULL AND raster_bytes IS NOT NULL AND raster_bbox IS NOT NULL
       AND raster_width IS NOT NULL AND raster_height IS NOT NULL AND raster_algorithm IS NOT NULL
       AND raster_mosaicking_order IS NOT NULL AND raster_archived_at IS NOT NULL)
    );

CREATE INDEX field_ndvi_snapshots_raster_idx
  ON field_ndvi_snapshots (tenant_id, field_id, captured_at DESC)
  WHERE raster_object_key IS NOT NULL;
