-- Equivalente SQLite de prisma/sql/001-indice-filtrado.sql.
--
-- Mesma regra: (provider, external_id) unico APENAS quando external_id existe.
-- Todo usuario local tem external_id NULL, e um unique comum rejeitaria o
-- segundo deles.
--
-- O SQLite tem indice parcial com a mesma clausula WHERE desde a versao 3.8,
-- entao a intencao atravessa os dois bancos. A diferenca e sintatica: sem
-- schema `dbo`, e IF NOT EXISTS no proprio CREATE em vez de um bloco IF.
CREATE UNIQUE INDEX IF NOT EXISTS tp_users_provider_external_id_uq
  ON tp_users (provider, external_id)
  WHERE external_id IS NOT NULL;
