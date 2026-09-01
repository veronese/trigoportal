-- ============================================================================
-- Portal Trigo — criacao do banco de dados (SQL Server 2017+ / Azure SQL)
-- ============================================================================
--
-- ARQUIVO GERADO. Nao edite a mao: rode `pnpm --filter @trigo/bff db:gerar-script`
-- sempre que o schema mudar. `db:verificar-script` falha se este arquivo estiver
-- desatualizado em relacao ao prisma/schema.prisma.
--
-- COMO USAR numa instancia nova:
--   1. Crie o database vazio. Este script NAO cria o database: no Azure
--      isso e operacao de infraestrutura (tier e custo), e em instancia
--      local a escolha de collation e arquivo e do DBA.
--
--      SQL Server local — a COLLATION IMPORTA:
--        CREATE DATABASE [trigo_portal_db]
--          COLLATE SQL_Latin1_General_CP1_CI_AS;
--
--      Tem que ser CI (case insensitive). A busca de usuario e de produto
--      conta com isso: o Prisma nao suporta `mode: insensitive` no provider
--      sqlserver, entao quem ignora a caixa e o banco. Em collation CS a
--      busca passa a diferenciar maiuscula de minuscula, sem erro nenhum —
--      so resultado faltando.
--   2. Execute este arquivo conectado a esse database.
--   3. Configure DATABASE_URL no .env do BFF.
--   4. Rode `pnpm --filter @trigo/bff db:seed` para criar o administrador
--      inicial (senha vem de SEED_ADMIN_PASSWORD). O hash NAO vem neste
--      script de proposito: senha nao entra em arquivo versionado.
--   5. Defina PARAMETER_ENCRYPTION_KEY no .env, ou os parametros do tipo
--      SECRET e CREDENTIAL nao poderao ser gravados.
--
-- Idempotente: pode rodar novamente sem duplicar objeto nem parametro.
-- Assinatura do conteudo: eb30e5c6ccab5cc8
-- ============================================================================

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

-- --------------------------------------------------------------------------
-- 1. Tabelas, chaves e indices (gerado de prisma/schema.prisma)
-- --------------------------------------------------------------------------

IF EXISTS (SELECT 1 FROM sys.tables WHERE name IN (N'tp_users', N'tp_parameters'))
BEGIN
  PRINT 'Tabelas do portal ja existem: etapa 1 ignorada.';
END
ELSE
BEGIN
  BEGIN TRY

  BEGIN TRAN;

  -- CreateSchema
  IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'dbo') EXEC sp_executesql N'CREATE SCHEMA [dbo];';

  -- CreateTable
  CREATE TABLE [dbo].[tp_users] (
      [id] NVARCHAR(36) NOT NULL,
      [name] NVARCHAR(200) NOT NULL,
      [email] NVARCHAR(320) NOT NULL,
      [password_hash] NVARCHAR(500),
      [role] NVARCHAR(20) NOT NULL CONSTRAINT [tp_users_role_df] DEFAULT 'USER',
      [is_active] BIT NOT NULL CONSTRAINT [tp_users_is_active_df] DEFAULT 1,
      [provider] NVARCHAR(30) NOT NULL CONSTRAINT [tp_users_provider_df] DEFAULT 'local',
      [external_id] NVARCHAR(100),
      [token_version] INT NOT NULL CONSTRAINT [tp_users_token_version_df] DEFAULT 0,
      [must_change_password] BIT NOT NULL CONSTRAINT [tp_users_must_change_password_df] DEFAULT 0,
      [password_changed_at] DATETIME2,
      [provisional_password_at] DATETIME2,
      [failed_login_attempts] INT NOT NULL CONSTRAINT [tp_users_failed_login_attempts_df] DEFAULT 0,
      [locked_until] DATETIME2,
      [last_login_at] DATETIME2,
      [created_at] DATETIME2 NOT NULL CONSTRAINT [tp_users_created_at_df] DEFAULT CURRENT_TIMESTAMP,
      [updated_at] DATETIME2 NOT NULL,
      CONSTRAINT [tp_users_pk] PRIMARY KEY CLUSTERED ([id]),
      CONSTRAINT [tp_users_email_uq] UNIQUE NONCLUSTERED ([email])
  );

  -- CreateTable
  CREATE TABLE [dbo].[tp_parameters] (
      [key] NVARCHAR(100) NOT NULL,
      [label] NVARCHAR(200) NOT NULL,
      [description] NVARCHAR(max),
      [group_name] NVARCHAR(50) NOT NULL,
      [value_type] NVARCHAR(20) NOT NULL CONSTRAINT [tp_parameters_value_type_df] DEFAULT 'STRING',
      [current_value] NVARCHAR(max),
      [default_value] NVARCHAR(max),
      [is_secret] BIT NOT NULL CONSTRAINT [tp_parameters_is_secret_df] DEFAULT 0,
      [updated_by] NVARCHAR(320),
      [updated_at] DATETIME2 NOT NULL,
      [created_at] DATETIME2 NOT NULL CONSTRAINT [tp_parameters_created_at_df] DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT [tp_parameters_pk] PRIMARY KEY CLUSTERED ([key])
  );

  -- CreateTable
  CREATE TABLE [dbo].[tp_companies] (
      [id] NVARCHAR(36) NOT NULL,
      [code] NVARCHAR(4) NOT NULL,
      [branch] NVARCHAR(8) NOT NULL,
      [corporate_name] NVARCHAR(120) NOT NULL,
      [branch_name] NVARCHAR(120),
      [tax_id] NVARCHAR(20),
      [state] NVARCHAR(4),
      [city] NVARCHAR(120),
      [is_active] BIT NOT NULL CONSTRAINT [tp_companies_is_active_df] DEFAULT 1,
      [synced_at] DATETIME2 NOT NULL,
      [created_at] DATETIME2 NOT NULL CONSTRAINT [tp_companies_created_at_df] DEFAULT CURRENT_TIMESTAMP,
      [updated_at] DATETIME2 NOT NULL,
      CONSTRAINT [tp_companies_pk] PRIMARY KEY CLUSTERED ([id]),
      CONSTRAINT [tp_companies_code_branch_uq] UNIQUE NONCLUSTERED ([code],[branch])
  );

  -- CreateTable
  CREATE TABLE [dbo].[tp_products] (
      [id] NVARCHAR(36) NOT NULL,
      [empori] NVARCHAR(2) NOT NULL CONSTRAINT [tp_products_empori_df] DEFAULT '',
      [source_table] NVARCHAR(10) NOT NULL,
      [code] NVARCHAR(30) NOT NULL,
      [description] NVARCHAR(120) NOT NULL,
      [type] NVARCHAR(4),
      [unit] NVARCHAR(4),
      [group_code] NVARCHAR(8),
      [default_warehouse] NVARCHAR(4),
      [ncm] NVARCHAR(20),
      [fiscal_model] NVARCHAR(10),
      [is_blocked] BIT NOT NULL CONSTRAINT [tp_products_is_blocked_df] DEFAULT 0,
      [is_active] BIT NOT NULL CONSTRAINT [tp_products_is_active_df] DEFAULT 1,
      [cost_center] NVARCHAR(20),
      [expense_account] NVARCHAR(20),
      [asset_account] NVARCHAR(20),
      [revenue_account] NVARCHAR(20),
      [sale_price] DECIMAL(18,4),
      [synced_at] DATETIME2 NOT NULL,
      [created_at] DATETIME2 NOT NULL CONSTRAINT [tp_products_created_at_df] DEFAULT CURRENT_TIMESTAMP,
      [updated_at] DATETIME2 NOT NULL,
      CONSTRAINT [tp_products_pk] PRIMARY KEY CLUSTERED ([id]),
      CONSTRAINT [tp_products_empori_code_uq] UNIQUE NONCLUSTERED ([empori],[code])
  );

  -- CreateTable
  CREATE TABLE [dbo].[tp_customers] (
      [id] NVARCHAR(36) NOT NULL,
      [code] NVARCHAR(20) NOT NULL,
      [store] NVARCHAR(4) NOT NULL,
      [name] NVARCHAR(120) NOT NULL,
      [short_name] NVARCHAR(60),
      [tax_id] NVARCHAR(20),
      [state] NVARCHAR(4),
      [city] NVARCHAR(120),
      [phone] NVARCHAR(30),
      [email] NVARCHAR(320),
      [is_blocked] BIT NOT NULL CONSTRAINT [tp_customers_is_blocked_df] DEFAULT 0,
      [synced_at] DATETIME2 NOT NULL,
      [created_at] DATETIME2 NOT NULL CONSTRAINT [tp_customers_created_at_df] DEFAULT CURRENT_TIMESTAMP,
      [updated_at] DATETIME2 NOT NULL,
      CONSTRAINT [tp_customers_pk] PRIMARY KEY CLUSTERED ([id]),
      CONSTRAINT [tp_customers_code_store_uq] UNIQUE NONCLUSTERED ([code],[store])
  );

  -- CreateTable
  CREATE TABLE [dbo].[tp_suppliers] (
      [id] NVARCHAR(36) NOT NULL,
      [code] NVARCHAR(20) NOT NULL,
      [store] NVARCHAR(4) NOT NULL,
      [name] NVARCHAR(120) NOT NULL,
      [short_name] NVARCHAR(60),
      [tax_id] NVARCHAR(20),
      [state] NVARCHAR(4),
      [city] NVARCHAR(120),
      [phone] NVARCHAR(30),
      [email] NVARCHAR(320),
      [is_blocked] BIT NOT NULL CONSTRAINT [tp_suppliers_is_blocked_df] DEFAULT 0,
      [synced_at] DATETIME2 NOT NULL,
      [created_at] DATETIME2 NOT NULL CONSTRAINT [tp_suppliers_created_at_df] DEFAULT CURRENT_TIMESTAMP,
      [updated_at] DATETIME2 NOT NULL,
      CONSTRAINT [tp_suppliers_pk] PRIMARY KEY CLUSTERED ([id]),
      CONSTRAINT [tp_suppliers_code_store_uq] UNIQUE NONCLUSTERED ([code],[store])
  );

  -- CreateTable
  CREATE TABLE [dbo].[tp_ficha_restaurantes] (
      [id] NVARCHAR(36) NOT NULL,
      [nome] NVARCHAR(80) NOT NULL,
      [cor] NVARCHAR(9) NOT NULL CONSTRAINT [tp_ficha_restaurantes_cor_df] DEFAULT '#2f3237',
      [ativo] BIT NOT NULL CONSTRAINT [tp_ficha_restaurantes_ativo_df] DEFAULT 1,
      [created_at] DATETIME2 NOT NULL CONSTRAINT [tp_ficha_restaurantes_created_at_df] DEFAULT CURRENT_TIMESTAMP,
      [updated_at] DATETIME2 NOT NULL,
      CONSTRAINT [tp_ficha_restaurantes_pk] PRIMARY KEY CLUSTERED ([id]),
      CONSTRAINT [tp_ficha_restaurantes_nome_uq] UNIQUE NONCLUSTERED ([nome])
  );

  -- CreateTable
  CREATE TABLE [dbo].[tp_ficha_linhas] (
      [id] NVARCHAR(36) NOT NULL,
      [nome] NVARCHAR(80) NOT NULL,
      [ativo] BIT NOT NULL CONSTRAINT [tp_ficha_linhas_ativo_df] DEFAULT 1,
      [created_at] DATETIME2 NOT NULL CONSTRAINT [tp_ficha_linhas_created_at_df] DEFAULT CURRENT_TIMESTAMP,
      [updated_at] DATETIME2 NOT NULL,
      CONSTRAINT [tp_ficha_linhas_pk] PRIMARY KEY CLUSTERED ([id]),
      CONSTRAINT [tp_ficha_linhas_nome_uq] UNIQUE NONCLUSTERED ([nome])
  );

  -- CreateTable
  CREATE TABLE [dbo].[tp_linhas_producao] (
      [id] NVARCHAR(36) NOT NULL,
      [nome] NVARCHAR(80) NOT NULL,
      [capacidade_kg] DECIMAL(18,6) NOT NULL,
      [ativa] BIT NOT NULL CONSTRAINT [tp_linhas_producao_ativa_df] DEFAULT 1,
      [created_at] DATETIME2 NOT NULL CONSTRAINT [tp_linhas_producao_created_at_df] DEFAULT CURRENT_TIMESTAMP,
      [updated_at] DATETIME2 NOT NULL,
      CONSTRAINT [tp_linhas_producao_pk] PRIMARY KEY CLUSTERED ([id]),
      CONSTRAINT [tp_linhas_producao_nome_uq] UNIQUE NONCLUSTERED ([nome])
  );

  -- CreateTable
  CREATE TABLE [dbo].[tp_ficha_insumos] (
      [id] NVARCHAR(36) NOT NULL,
      [codigo] NVARCHAR(30) NOT NULL,
      [descricao] NVARCHAR(200) NOT NULL,
      [unidade] NVARCHAR(10) NOT NULL CONSTRAINT [tp_ficha_insumos_unidade_df] DEFAULT 'KG',
      [categoria] NVARCHAR(20) NOT NULL CONSTRAINT [tp_ficha_insumos_categoria_df] DEFAULT 'materia',
      [custo_referencia] DECIMAL(18,6),
      [custo_data] DATETIME2,
      [codigo_protheus] NVARCHAR(30),
      [status_integracao] NVARCHAR(20) NOT NULL CONSTRAINT [tp_ficha_insumos_status_integracao_df] DEFAULT 'provisorio',
      [vinculado_por] NVARCHAR(320),
      [vinculado_em] DATETIME2,
      [fornecedor] NVARCHAR(200),
      [marca] NVARCHAR(120),
      [observacao] NVARCHAR(500),
      [created_at] DATETIME2 NOT NULL CONSTRAINT [tp_ficha_insumos_created_at_df] DEFAULT CURRENT_TIMESTAMP,
      [updated_at] DATETIME2 NOT NULL,
      CONSTRAINT [tp_ficha_insumos_pk] PRIMARY KEY CLUSTERED ([id]),
      CONSTRAINT [tp_ficha_insumos_codigo_uq] UNIQUE NONCLUSTERED ([codigo])
  );

  -- CreateTable
  CREATE TABLE [dbo].[tp_fichas] (
      [id] NVARCHAR(36) NOT NULL,
      [codigo] NVARCHAR(30) NOT NULL,
      [nome] NVARCHAR(200) NOT NULL,
      [restaurante_id] NVARCHAR(36) NOT NULL,
      [linha_id] NVARCHAR(36) NOT NULL,
      [categoria] NVARCHAR(80),
      [created_at] DATETIME2 NOT NULL CONSTRAINT [tp_fichas_created_at_df] DEFAULT CURRENT_TIMESTAMP,
      [updated_at] DATETIME2 NOT NULL,
      CONSTRAINT [tp_fichas_pk] PRIMARY KEY CLUSTERED ([id]),
      CONSTRAINT [tp_fichas_codigo_uq] UNIQUE NONCLUSTERED ([codigo])
  );

  -- CreateTable
  CREATE TABLE [dbo].[tp_ficha_fases] (
      [id] NVARCHAR(36) NOT NULL,
      [ficha_id] NVARCHAR(36) NOT NULL,
      [fase] NVARCHAR(20) NOT NULL,
      [origem_versao_id] NVARCHAR(36),
      [quantidade_alvo_kg] DECIMAL(18,6),
      [linha_producao_id] NVARCHAR(36),
      [created_at] DATETIME2 NOT NULL CONSTRAINT [tp_ficha_fases_created_at_df] DEFAULT CURRENT_TIMESTAMP,
      [updated_at] DATETIME2 NOT NULL,
      CONSTRAINT [tp_ficha_fases_pk] PRIMARY KEY CLUSTERED ([id]),
      CONSTRAINT [tp_ficha_fases_ficha_fase_uq] UNIQUE NONCLUSTERED ([ficha_id],[fase])
  );

  -- CreateTable
  CREATE TABLE [dbo].[tp_ficha_versoes] (
      [id] NVARCHAR(36) NOT NULL,
      [fase_id] NVARCHAR(36) NOT NULL,
      [versao_formula] INT NOT NULL,
      [revisao_documental] NVARCHAR(20),
      [revisao_protheus] NVARCHAR(20),
      [nome] NVARCHAR(120),
      [motivo] NVARCHAR(500),
      [status] NVARCHAR(20) NOT NULL CONSTRAINT [tp_ficha_versoes_status_df] DEFAULT 'rascunho',
      [quantidade_final_kg] DECIMAL(18,6),
      [fator_escala] DECIMAL(18,9),
      [peso_unitario] DECIMAL(18,6),
      [preco_venda] DECIMAL(18,6),
      [custo_batida] DECIMAL(18,6),
      [rendimento_kg] DECIMAL(18,6),
      [custo_kg] DECIMAL(18,6),
      [custo_unidade] DECIMAL(18,6),
      [criado_por] NVARCHAR(320) NOT NULL,
      [congelado_em] DATETIME2,
      [codigo_documento] NVARCHAR(40),
      [area] NVARCHAR(40),
      [descricao_comercial] NVARCHAR(200),
      [descricao_tecnica] NVARCHAR(500),
      [armazenamento] NVARCHAR(120),
      [shelf_life_dias] INT,
      [bags_por_caixa] INT,
      [caixas_por_pallet] INT,
      [numero_caldeiras] INT,
      [data_elaboracao] DATETIME2,
      [data_revisao] DATETIME2,
      [created_at] DATETIME2 NOT NULL CONSTRAINT [tp_ficha_versoes_created_at_df] DEFAULT CURRENT_TIMESTAMP,
      [updated_at] DATETIME2 NOT NULL,
      CONSTRAINT [tp_ficha_versoes_pk] PRIMARY KEY CLUSTERED ([id]),
      CONSTRAINT [tp_ficha_versoes_fase_versao_uq] UNIQUE NONCLUSTERED ([fase_id],[versao_formula])
  );

  -- CreateTable
  CREATE TABLE [dbo].[tp_ficha_etapas] (
      [id] NVARCHAR(36) NOT NULL,
      [versao_id] NVARCHAR(36) NOT NULL,
      [nome] NVARCHAR(120) NOT NULL,
      [tipo] NVARCHAR(20) NOT NULL,
      [ordem] INT NOT NULL,
      [usa_percentual] BIT NOT NULL CONSTRAINT [tp_ficha_etapas_usa_percentual_df] DEFAULT 1,
      [media_batidas] INT NOT NULL CONSTRAINT [tp_ficha_etapas_media_batidas_df] DEFAULT 1,
      [rendimento_modo] NVARCHAR(10) NOT NULL CONSTRAINT [tp_ficha_etapas_rendimento_modo_df] DEFAULT 'perdas',
      [rendimento_fator] DECIMAL(18,6),
      CONSTRAINT [tp_ficha_etapas_pk] PRIMARY KEY CLUSTERED ([id]),
      CONSTRAINT [tp_ficha_etapas_versao_ordem_uq] UNIQUE NONCLUSTERED ([versao_id],[ordem])
  );

  -- CreateTable
  CREATE TABLE [dbo].[tp_ficha_itens] (
      [id] NVARCHAR(36) NOT NULL,
      [etapa_id] NVARCHAR(36) NOT NULL,
      [ordem] INT NOT NULL,
      [codigo] NVARCHAR(30) NOT NULL,
      [descricao] NVARCHAR(200) NOT NULL,
      [unidade] NVARCHAR(10) NOT NULL,
      [modo] NVARCHAR(20) NOT NULL CONSTRAINT [tp_ficha_itens_modo_df] DEFAULT 'fixa',
      [qtd] DECIMAL(18,6),
      [preco] DECIMAL(18,6) NOT NULL CONSTRAINT [tp_ficha_itens_preco_df] DEFAULT 0,
      [preco_data] DATETIME2,
      [base] DECIMAL(18,6),
      [coef] DECIMAL(18,6),
      [lote] INT,
      [ref] NVARCHAR(36),
      [insumo_id] NVARCHAR(36),
      [provisorio] BIT NOT NULL CONSTRAINT [tp_ficha_itens_provisorio_df] DEFAULT 0,
      CONSTRAINT [tp_ficha_itens_pk] PRIMARY KEY CLUSTERED ([id])
  );

  -- CreateTable
  CREATE TABLE [dbo].[tp_ficha_perdas] (
      [id] NVARCHAR(36) NOT NULL,
      [etapa_id] NVARCHAR(36) NOT NULL,
      [nome] NVARCHAR(120) NOT NULL,
      [valor_kg] DECIMAL(18,6) NOT NULL,
      [unidade] NVARCHAR(10) NOT NULL CONSTRAINT [tp_ficha_perdas_unidade_df] DEFAULT 'KG',
      [percentual] DECIMAL(18,6),
      [tipo] NVARCHAR(20) NOT NULL CONSTRAINT [tp_ficha_perdas_tipo_df] DEFAULT 'sobre_entrada',
      [rateada] BIT NOT NULL CONSTRAINT [tp_ficha_perdas_rateada_df] DEFAULT 0,
      [observacao] NVARCHAR(500),
      [ordem] INT NOT NULL CONSTRAINT [tp_ficha_perdas_ordem_df] DEFAULT 0,
      CONSTRAINT [tp_ficha_perdas_pk] PRIMARY KEY CLUSTERED ([id])
  );

  -- CreateTable
  CREATE TABLE [dbo].[tp_ficha_processos] (
      [id] NVARCHAR(36) NOT NULL,
      [versao_id] NVARCHAR(36) NOT NULL,
      [codigo_documento] NVARCHAR(40),
      [revisao] NVARCHAR(20),
      [conservacao] NVARCHAR(200),
      [rendimento_industrial] NVARCHAR(200),
      [sensorial_cor] NVARCHAR(500),
      [sensorial_sabor] NVARCHAR(500),
      [sensorial_aroma] NVARCHAR(500),
      [sensorial_textura] NVARCHAR(500),
      [sensorial_aspecto] NVARCHAR(500),
      [imagem_url] NVARCHAR(500),
      CONSTRAINT [tp_ficha_processos_pk] PRIMARY KEY CLUSTERED ([id]),
      CONSTRAINT [tp_ficha_processos_versao_uq] UNIQUE NONCLUSTERED ([versao_id])
  );

  -- CreateTable
  CREATE TABLE [dbo].[tp_ficha_processo_passos] (
      [id] NVARCHAR(36) NOT NULL,
      [processo_id] NVARCHAR(36) NOT NULL,
      [ordem] INT NOT NULL,
      [descricao] NVARCHAR(1000) NOT NULL,
      [equipamento] NVARCHAR(120),
      [velocidade] NVARCHAR(60),
      [tempo_minutos] DECIMAL(18,2),
      [temperatura] NVARCHAR(60),
      [ponto_controle] NVARCHAR(500),
      [observacao] NVARCHAR(500),
      CONSTRAINT [tp_ficha_processo_passos_pk] PRIMARY KEY CLUSTERED ([id]),
      CONSTRAINT [tp_ficha_processo_passos_ordem_uq] UNIQUE NONCLUSTERED ([processo_id],[ordem])
  );

  -- CreateTable
  CREATE TABLE [dbo].[tp_ficha_ingredientes_operacionais] (
      [id] NVARCHAR(36) NOT NULL,
      [processo_id] NVARCHAR(36) NOT NULL,
      [ordem] INT NOT NULL,
      [nome] NVARCHAR(200) NOT NULL,
      [quantidade_kg] DECIMAL(18,6),
      [orientacao] NVARCHAR(300) NOT NULL,
      CONSTRAINT [tp_ficha_ingredientes_op_pk] PRIMARY KEY CLUSTERED ([id]),
      CONSTRAINT [tp_ficha_ingredientes_op_ordem_uq] UNIQUE NONCLUSTERED ([processo_id],[ordem])
  );

  -- CreateTable
  CREATE TABLE [dbo].[tp_ficha_aprovacoes] (
      [id] NVARCHAR(36) NOT NULL,
      [versao_id] NVARCHAR(36) NOT NULL,
      [area] NVARCHAR(20) NOT NULL,
      [ordem] INT NOT NULL,
      [status] NVARCHAR(20) NOT NULL CONSTRAINT [tp_ficha_aprovacoes_status_df] DEFAULT 'pendente',
      [decidido_por] NVARCHAR(320),
      [decidido_em] DATETIME2,
      [comentario] NVARCHAR(1000),
      [identificador] NVARCHAR(60),
      CONSTRAINT [tp_ficha_aprovacoes_pk] PRIMARY KEY CLUSTERED ([id]),
      CONSTRAINT [tp_ficha_aprovacoes_versao_area_uq] UNIQUE NONCLUSTERED ([versao_id],[area])
  );

  -- CreateTable
  CREATE TABLE [dbo].[tp_ficha_alteracoes_documentais] (
      [id] NVARCHAR(36) NOT NULL,
      [versao_id] NVARCHAR(36) NOT NULL,
      [revisao] NVARCHAR(20) NOT NULL,
      [data] DATETIME2 NOT NULL,
      [alteracao] NVARCHAR(1000) NOT NULL,
      [responsavel] NVARCHAR(200) NOT NULL,
      CONSTRAINT [tp_ficha_alteracoes_pk] PRIMARY KEY CLUSTERED ([id])
  );

  -- CreateTable
  CREATE TABLE [dbo].[tp_ficha_auditoria] (
      [id] NVARCHAR(36) NOT NULL,
      [ficha_id] NVARCHAR(36) NOT NULL,
      [versao_id] NVARCHAR(36),
      [evento] NVARCHAR(40) NOT NULL,
      [campo] NVARCHAR(120),
      [valor_anterior] NVARCHAR(1000),
      [valor_novo] NVARCHAR(1000),
      [autor] NVARCHAR(320) NOT NULL,
      [motivo] NVARCHAR(1000),
      [created_at] DATETIME2 NOT NULL CONSTRAINT [tp_ficha_auditoria_created_at_df] DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT [tp_ficha_auditoria_pk] PRIMARY KEY CLUSTERED ([id])
  );

  -- CreateTable
  CREATE TABLE [dbo].[tp_ficha_integracoes] (
      [id] NVARCHAR(36) NOT NULL,
      [versao_id] NVARCHAR(36) NOT NULL,
      [status] NVARCHAR(20) NOT NULL CONSTRAINT [tp_ficha_integracoes_status_df] DEFAULT 'pendente',
      [codigo_produto] NVARCHAR(30),
      [revisao_protheus] NVARCHAR(20),
      [mensagem] NVARCHAR(2000),
      [tentativa] INT NOT NULL CONSTRAINT [tp_ficha_integracoes_tentativa_df] DEFAULT 1,
      [autor] NVARCHAR(320) NOT NULL,
      [created_at] DATETIME2 NOT NULL CONSTRAINT [tp_ficha_integracoes_created_at_df] DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT [tp_ficha_integracoes_pk] PRIMARY KEY CLUSTERED ([id])
  );

  -- CreateIndex
  CREATE NONCLUSTERED INDEX [tp_users_is_active_idx] ON [dbo].[tp_users]([is_active]);

  -- CreateIndex
  CREATE NONCLUSTERED INDEX [tp_users_provider_external_id_idx] ON [dbo].[tp_users]([provider], [external_id]);

  -- CreateIndex
  CREATE NONCLUSTERED INDEX [tp_parameters_group_name_idx] ON [dbo].[tp_parameters]([group_name]);

  -- CreateIndex
  CREATE NONCLUSTERED INDEX [tp_products_description_idx] ON [dbo].[tp_products]([description]);

  -- CreateIndex
  CREATE NONCLUSTERED INDEX [tp_products_group_code_idx] ON [dbo].[tp_products]([group_code]);

  -- CreateIndex
  CREATE NONCLUSTERED INDEX [tp_customers_name_idx] ON [dbo].[tp_customers]([name]);

  -- CreateIndex
  CREATE NONCLUSTERED INDEX [tp_customers_tax_id_idx] ON [dbo].[tp_customers]([tax_id]);

  -- CreateIndex
  CREATE NONCLUSTERED INDEX [tp_suppliers_name_idx] ON [dbo].[tp_suppliers]([name]);

  -- CreateIndex
  CREATE NONCLUSTERED INDEX [tp_suppliers_tax_id_idx] ON [dbo].[tp_suppliers]([tax_id]);

  -- CreateIndex
  CREATE NONCLUSTERED INDEX [tp_ficha_insumos_descricao_idx] ON [dbo].[tp_ficha_insumos]([descricao]);

  -- CreateIndex
  CREATE NONCLUSTERED INDEX [tp_ficha_insumos_status_integracao_idx] ON [dbo].[tp_ficha_insumos]([status_integracao]);

  -- CreateIndex
  CREATE NONCLUSTERED INDEX [tp_fichas_nome_idx] ON [dbo].[tp_fichas]([nome]);

  -- CreateIndex
  CREATE NONCLUSTERED INDEX [tp_fichas_pasta_idx] ON [dbo].[tp_fichas]([restaurante_id], [linha_id]);

  -- CreateIndex
  CREATE NONCLUSTERED INDEX [tp_ficha_fases_origem_idx] ON [dbo].[tp_ficha_fases]([origem_versao_id]);

  -- CreateIndex
  CREATE NONCLUSTERED INDEX [tp_ficha_versoes_status_idx] ON [dbo].[tp_ficha_versoes]([status]);

  -- CreateIndex
  CREATE NONCLUSTERED INDEX [tp_ficha_itens_etapa_ordem_idx] ON [dbo].[tp_ficha_itens]([etapa_id], [ordem]);

  -- CreateIndex
  CREATE NONCLUSTERED INDEX [tp_ficha_itens_insumo_idx] ON [dbo].[tp_ficha_itens]([insumo_id]);

  -- CreateIndex
  CREATE NONCLUSTERED INDEX [tp_ficha_itens_codigo_idx] ON [dbo].[tp_ficha_itens]([codigo]);

  -- CreateIndex
  CREATE NONCLUSTERED INDEX [tp_ficha_perdas_etapa_idx] ON [dbo].[tp_ficha_perdas]([etapa_id]);

  -- CreateIndex
  CREATE NONCLUSTERED INDEX [tp_ficha_aprovacoes_status_idx] ON [dbo].[tp_ficha_aprovacoes]([status]);

  -- CreateIndex
  CREATE NONCLUSTERED INDEX [tp_ficha_alteracoes_versao_idx] ON [dbo].[tp_ficha_alteracoes_documentais]([versao_id]);

  -- CreateIndex
  CREATE NONCLUSTERED INDEX [tp_ficha_auditoria_ficha_data_idx] ON [dbo].[tp_ficha_auditoria]([ficha_id], [created_at]);

  -- CreateIndex
  CREATE NONCLUSTERED INDEX [tp_ficha_auditoria_evento_idx] ON [dbo].[tp_ficha_auditoria]([evento]);

  -- CreateIndex
  CREATE NONCLUSTERED INDEX [tp_ficha_integracoes_versao_data_idx] ON [dbo].[tp_ficha_integracoes]([versao_id], [created_at]);

  -- CreateIndex
  CREATE NONCLUSTERED INDEX [tp_ficha_integracoes_status_idx] ON [dbo].[tp_ficha_integracoes]([status]);

  -- AddForeignKey
  ALTER TABLE [dbo].[tp_fichas] ADD CONSTRAINT [tp_fichas_restaurante_id_fkey] FOREIGN KEY ([restaurante_id]) REFERENCES [dbo].[tp_ficha_restaurantes]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

  -- AddForeignKey
  ALTER TABLE [dbo].[tp_fichas] ADD CONSTRAINT [tp_fichas_linha_id_fkey] FOREIGN KEY ([linha_id]) REFERENCES [dbo].[tp_ficha_linhas]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

  -- AddForeignKey
  ALTER TABLE [dbo].[tp_ficha_fases] ADD CONSTRAINT [tp_ficha_fases_ficha_id_fkey] FOREIGN KEY ([ficha_id]) REFERENCES [dbo].[tp_fichas]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

  -- AddForeignKey
  ALTER TABLE [dbo].[tp_ficha_fases] ADD CONSTRAINT [tp_ficha_fases_origem_versao_id_fkey] FOREIGN KEY ([origem_versao_id]) REFERENCES [dbo].[tp_ficha_versoes]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

  -- AddForeignKey
  ALTER TABLE [dbo].[tp_ficha_fases] ADD CONSTRAINT [tp_ficha_fases_linha_producao_id_fkey] FOREIGN KEY ([linha_producao_id]) REFERENCES [dbo].[tp_linhas_producao]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

  -- AddForeignKey
  ALTER TABLE [dbo].[tp_ficha_versoes] ADD CONSTRAINT [tp_ficha_versoes_fase_id_fkey] FOREIGN KEY ([fase_id]) REFERENCES [dbo].[tp_ficha_fases]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

  -- AddForeignKey
  ALTER TABLE [dbo].[tp_ficha_etapas] ADD CONSTRAINT [tp_ficha_etapas_versao_id_fkey] FOREIGN KEY ([versao_id]) REFERENCES [dbo].[tp_ficha_versoes]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

  -- AddForeignKey
  ALTER TABLE [dbo].[tp_ficha_itens] ADD CONSTRAINT [tp_ficha_itens_etapa_id_fkey] FOREIGN KEY ([etapa_id]) REFERENCES [dbo].[tp_ficha_etapas]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

  -- AddForeignKey
  ALTER TABLE [dbo].[tp_ficha_perdas] ADD CONSTRAINT [tp_ficha_perdas_etapa_id_fkey] FOREIGN KEY ([etapa_id]) REFERENCES [dbo].[tp_ficha_etapas]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

  -- AddForeignKey
  ALTER TABLE [dbo].[tp_ficha_processos] ADD CONSTRAINT [tp_ficha_processos_versao_id_fkey] FOREIGN KEY ([versao_id]) REFERENCES [dbo].[tp_ficha_versoes]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

  -- AddForeignKey
  ALTER TABLE [dbo].[tp_ficha_processo_passos] ADD CONSTRAINT [tp_ficha_processo_passos_processo_id_fkey] FOREIGN KEY ([processo_id]) REFERENCES [dbo].[tp_ficha_processos]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

  -- AddForeignKey
  ALTER TABLE [dbo].[tp_ficha_ingredientes_operacionais] ADD CONSTRAINT [tp_ficha_ingredientes_operacionais_processo_id_fkey] FOREIGN KEY ([processo_id]) REFERENCES [dbo].[tp_ficha_processos]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

  -- AddForeignKey
  ALTER TABLE [dbo].[tp_ficha_aprovacoes] ADD CONSTRAINT [tp_ficha_aprovacoes_versao_id_fkey] FOREIGN KEY ([versao_id]) REFERENCES [dbo].[tp_ficha_versoes]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

  -- AddForeignKey
  ALTER TABLE [dbo].[tp_ficha_alteracoes_documentais] ADD CONSTRAINT [tp_ficha_alteracoes_documentais_versao_id_fkey] FOREIGN KEY ([versao_id]) REFERENCES [dbo].[tp_ficha_versoes]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

  -- AddForeignKey
  ALTER TABLE [dbo].[tp_ficha_auditoria] ADD CONSTRAINT [tp_ficha_auditoria_ficha_id_fkey] FOREIGN KEY ([ficha_id]) REFERENCES [dbo].[tp_fichas]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

  -- AddForeignKey
  ALTER TABLE [dbo].[tp_ficha_auditoria] ADD CONSTRAINT [tp_ficha_auditoria_versao_id_fkey] FOREIGN KEY ([versao_id]) REFERENCES [dbo].[tp_ficha_versoes]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

  -- AddForeignKey
  ALTER TABLE [dbo].[tp_ficha_integracoes] ADD CONSTRAINT [tp_ficha_integracoes_versao_id_fkey] FOREIGN KEY ([versao_id]) REFERENCES [dbo].[tp_ficha_versoes]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

  COMMIT TRAN;

  END TRY
  BEGIN CATCH

  IF @@TRANCOUNT > 0
  BEGIN
      ROLLBACK TRAN;
  END;
  THROW

  END CATCH
END
GO

-- --------------------------------------------------------------------------
-- 2. Objetos que o Prisma nao declara (indice filtrado)
-- --------------------------------------------------------------------------

-- 001-indice-filtrado.sql
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
GO

-- --------------------------------------------------------------------------
-- 3. Parametros do Configurador
-- --------------------------------------------------------------------------

-- 18 parametros do Configurador, no padrao de fabrica.
-- Idempotente: so insere o que ainda nao existe.
MERGE [dbo].[tp_parameters] AS destino
USING (VALUES
  (N'PORTAL_NOME', N'Nome do portal', N'Exibido no menu, na tela de login e no titulo da aba.', N'Geral', N'STRING', NULL, N'Portal Trigo', 0, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()),
  (N'PORTAL_MENSAGEM_LOGIN', N'Mensagem da tela de login', N'Texto de apoio abaixo do titulo na tela de acesso.', N'Geral', N'STRING', NULL, N'Entre com suas credenciais corporativas', 0, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()),
  (N'PORTAL_EMAIL_SUPORTE', N'E-mail de suporte', N'Canal exibido ao usuario quando o acesso e recusado.', N'Geral', N'STRING', NULL, N'', 0, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()),
  (N'PORTAL_PAGINACAO_PADRAO', N'Registros por pagina', N'Quantidade padrao de linhas nas listagens do portal.', N'Geral', N'NUMBER', NULL, N'20', 0, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()),
  (N'SESSAO_DURACAO_HORAS', N'Duracao da sessao (horas)', N'Validade do token de acesso. Alterar afeta apenas os logins seguintes, nao as sessoes ja abertas.', N'Seguranca', N'NUMBER', NULL, N'8', 0, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()),
  (N'SENHA_EXIGE_TROCA_PRIMEIRO_ACESSO', N'Exigir troca de senha no primeiro acesso', N'Quando ativo, o usuario criado por um admin entra com a sessao travada na tela de troca de senha. Redefinicao de senha feita por admin sempre exige a troca, independente deste parametro.', N'Seguranca', N'BOOLEAN', NULL, N'true', 0, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()),
  (N'SENHA_PROVISORIA_VALIDADE_HORAS', N'Validade da senha provisoria (horas)', N'Prazo para o usuario usar a senha definida por um admin. Passado o prazo, o login e recusado e o admin precisa emitir uma nova. Zero desativa o prazo.', N'Seguranca', N'NUMBER', NULL, N'72', 0, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()),
  (N'LOGIN_TENTATIVAS_MAX', N'Tentativas de login antes do bloqueio', N'Erros consecutivos de senha que bloqueiam a conta temporariamente. O contador zera a cada login bem-sucedido. Zero desativa o bloqueio.', N'Seguranca', N'NUMBER', NULL, N'5', 0, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()),
  (N'LOGIN_BLOQUEIO_MINUTOS', N'Duracao do bloqueio (minutos)', N'Quanto tempo a conta fica bloqueada depois de estourar as tentativas. Um admin pode liberar antes em Cadastros > Usuarios.', N'Seguranca', N'NUMBER', NULL, N'15', 0, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()),
  (N'BANCO_LIMITE_REGISTROS_CONSULTA', N'Limite de registros por consulta', N'Teto de linhas que uma listagem pode pedir de uma vez, mesmo que a tela solicite mais. Protege o banco de uma consulta que varre a tabela inteira.', N'Banco de dados', N'NUMBER', NULL, N'100', 0, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()),
  (N'PROTHEUS_REST_URL', N'URL do REST do Protheus', N'Endereco base do appserver com mod_rest habilitado. Ex: http://servidor:8080/rest', N'Protheus', N'STRING', NULL, N'', 0, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()),
  (N'PROTHEUS_TIMEOUT_SEGUNDOS', N'Timeout das chamadas (segundos)', N'Tempo maximo de espera por resposta do Protheus antes de abortar.', N'Protheus', N'NUMBER', NULL, N'30', 0, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()),
  (N'PROTHEUS_CACHE_MINUTOS', N'Cache de consultas (minutos)', N'Por quanto tempo o BFF reaproveita a resposta do Protheus. Protege licenca e thread do appserver. Zero desliga o cache.', N'Protheus', N'NUMBER', NULL, N'5', 0, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()),
  (N'PROTHEUS_CREDENCIAL', N'Credencial de integracao', N'Usuario e senha que o portal usa para autenticar no REST do Protheus. Use uma conta de servico dedicada, com acesso apenas as rotinas necessarias — nunca a conta de uma pessoa. O par vai cifrado com AES-256-GCM e a senha nunca e devolvida pela API.', N'Protheus', N'CREDENTIAL', NULL, NULL, 1, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()),
  (N'PRODUTOS_ENDPOINT', N'Rota do endpoint de produtos', N'Caminho do WSRESTFUL zWsProdutos no appserver, relativo a URL base do REST. Mudou o nome do servico no Protheus? E aqui que se ajusta, sem deploy.', N'Carga de produtos', N'STRING', NULL, N'/zWsProdutos/get_all', 0, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()),
  (N'PRODUTOS_EMPRESAS', N'Empresas a carregar', N'Codigos de empresa separados por virgula. Cada um vira uma chamada ao Protheus, lendo a tabela SB1 daquela empresa, e o codigo vai para a coluna EMPORI do produto. Ex: 02,09 le SB1020 e SB1090.', N'Carga de produtos', N'STRING', NULL, N'02,09', 0, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()),
  (N'PRODUTOS_PAGINA_TAMANHO', N'Registros por pagina na carga', N'Quantos produtos o Protheus devolve por chamada. Pagina grande faz menos requisicoes mas ocupa a thread do appserver por mais tempo.', N'Carga de produtos', N'NUMBER', NULL, N'200', 0, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()),
  (N'PRODUTOS_PAGINAS_MAXIMO', N'Limite de paginas por empresa', N'Trava de seguranca da carga. O endpoint zWsProdutos devolve a pagina 1 quando se pede pagina inexistente, o que sem limite viraria laco infinito. Zero remove a trava.', N'Carga de produtos', N'NUMBER', NULL, N'2000', 0, NULL, SYSUTCDATETIME(), SYSUTCDATETIME())
) AS origem ([key], [label], [description], [group_name], [value_type], [current_value], [default_value], [is_secret], [updated_by], [updated_at], [created_at])
  ON destino.[key] = origem.[key]
WHEN NOT MATCHED THEN
  INSERT ([key], [label], [description], [group_name], [value_type], [current_value], [default_value], [is_secret], [updated_by], [updated_at], [created_at])
  VALUES (origem.[key], origem.[label], origem.[description], origem.[group_name], origem.[value_type], origem.[current_value], origem.[default_value], origem.[is_secret], origem.[updated_by], origem.[updated_at], origem.[created_at]);
GO

PRINT 'Portal Trigo: estrutura criada. Rode db:seed para o administrador inicial.';
GO
