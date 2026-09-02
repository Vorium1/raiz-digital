BEGIN;

-- Guarda o último passo de 30s do código TOTP aceito para este usuário. Sem isso, o mesmo código de
-- 6 dígitos poderia ser reaproveitado por até ~90 segundos (a janela de tolerância de ±1 passo) por
-- quem o interceptasse (log, proxy, "shoulder surfing"), derrubando a garantia de "código de uso único"
-- que o TOTP deveria oferecer.
ALTER TABLE users ADD COLUMN totp_last_counter bigint;

COMMIT;
