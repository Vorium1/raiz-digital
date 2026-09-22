ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS provider_order_id text,
  ADD COLUMN IF NOT EXISTS checkout_url text,
  ADD COLUMN IF NOT EXISTS checkout_created_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_provider_order_unique
  ON invoices(provider, provider_order_id)
  WHERE provider_order_id IS NOT NULL;

COMMENT ON COLUMN invoices.provider_order_id IS
  'ID da order criada no provedor para iniciar o checkout. Não confundir com provider_charge_id, que identifica o pagamento conciliado.';

COMMENT ON COLUMN invoices.checkout_url IS
  'URL de redirecionamento devolvida pelo provedor. É conveniência de UX, não autoridade para status financeiro.';
