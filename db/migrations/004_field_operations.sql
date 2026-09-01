BEGIN;

ALTER TABLE collection_orders
  ADD COLUMN IF NOT EXISTS sampling_strategy text NOT NULL DEFAULT 'GRID'
    CHECK (sampling_strategy IN ('GRID','IMPORTED','MANUAL')),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE sample_points
  ADD COLUMN IF NOT EXISTS sequence integer,
  ADD COLUMN IF NOT EXISTS observed_position geometry(Point,4326),
  ADD COLUMN IF NOT EXISTS accuracy_m numeric(10,2),
  ADD COLUMN IF NOT EXISTS source_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS collection_orders_crop_season_idx
  ON collection_orders (tenant_id, crop_season_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sample_points_order_sequence_idx
  ON sample_points (tenant_id, collection_order_id, sequence);

CREATE INDEX IF NOT EXISTS sample_points_observed_position_gix
  ON sample_points USING gist(observed_position);

CREATE OR REPLACE FUNCTION app.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS collection_orders_touch_updated_at ON collection_orders;
CREATE TRIGGER collection_orders_touch_updated_at
BEFORE UPDATE ON collection_orders
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

COMMIT;
