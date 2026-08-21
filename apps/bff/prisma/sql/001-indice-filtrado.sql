/*
  Unicidade de (provider, external_id) apenas quando external_id existe.

  Por que nao esta no schema.prisma: o SQL Server trata NULL como valor IGUAL
  numa constraint unica. Como todo usuario local tem external_id NULL, um
  @@unique([provider, externalId]) comum rejeitaria o SEGUNDO usuario local com
  "Cannot insert duplicate key". O Prisma nao declara indice filtrado, entao ele
  vive aqui e e aplicado por scripts/aplicar-sql.ts.

  Nome segue a convencao: tp_<tabela>_<colunas>_uq.
  Idempotente: pode rodar quantas vezes quiser.
*/
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'tp_users_provider_external_id_uq'
    AND object_id = OBJECT_ID('dbo.tp_users')
)
BEGIN
  CREATE UNIQUE INDEX [tp_users_provider_external_id_uq]
    ON [dbo].[tp_users] ([provider], [external_id])
    WHERE [external_id] IS NOT NULL;
END
