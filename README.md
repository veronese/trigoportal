# Portal Trigo

Portal corporativo (Web + PWA mobile) que substitui as rotinas mais massantes do Protheus
por telas modernas, consumindo o ERP via API/WS através de um BFF.

**Fase 1 (este repositório):** autenticação, sessão e cadastro de usuários com papéis e permissões.
**Fase 2:** módulos de negócio consumindo Protheus (REST/SOAP) pelo BFF.
**Fase 3:** app React Native (Expo) reaproveitando BFF, tipos e regras.

---

## Como rodar

Pré-requisitos: **Node 22+** e **pnpm 10+**.

```bash
npm install -g pnpm@10
```

Na raiz do repositório:

```bash
pnpm bootstrap
```

Esse comando instala as dependências, compila os pacotes compartilhados, cria o banco SQLite
e cadastra o usuário administrador. Depois:

```bash
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3334/api (health check em `/api/health`, docs em `/api/docs`)

**Acesso inicial** (definido em `apps/bff/.env`):

- E-mail: `admin@grupotrigo.com.br`
- Senha: `Trigo@2026Portal` — **provisória**. No primeiro login o portal trava a sessão na tela
  de troca de senha e não libera nenhuma rotina antes da troca.

## Estrutura

```
apps/
  web/        Next.js 15 (App Router) + Tailwind v4 + PWA
  bff/        NestJS 11 + Prisma  <- única camada que fala com o Protheus
packages/
  core/       Domínio puro: papéis, permissões, schemas Zod, tipos. Sem React, sem Nest.
  api-client/ Cliente HTTP tipado. Serve web hoje e o React Native depois.
```

### Por que existe o BFF

O front **nunca** fala direto com o Protheus. Motivos:

- **Licença e thread do appserver.** Cada request REST/WS ocupa recurso do Protheus. O BFF
  centraliza, faz cache e enfileira, evitando que uma tela com refresh derrube o ambiente.
- **Agregação.** Uma tela geralmente precisa de 3–4 chamadas do Protheus. O BFF devolve
  um payload único já pronto, e é isso que faz a tela parecer rápida.
- **Segurança.** Credencial/token do Protheus fica no servidor. O dispositivo só recebe
  o JWT do portal.
- **Consultas pesadas.** Listagem e relatório saem melhor de uma réplica de leitura do banco;
  o REST/WS fica para gravação, onde a regra de negócio precisa passar pelo MVC/ExecAuto.

### Fluxo de autenticação

1. Web faz `POST /api/bff/auth/login` — sempre na própria origem, via proxy do Next
   (`next.config.ts` → `rewrites`). Isso mantém o cookie como same-site, sem CORS.
2. O BFF valida no `IdentityProvider`, emite JWT e grava em cookie `httpOnly`.
3. `JwtAuthGuard` é global: **toda** rota exige sessão, salvo as marcadas com `@Public()`.
4. `PermissionsGuard` valida `@RequirePermission('users:write')` usando a mesma função
   `can()` que a tela usa para esconder botões.

Revogação de sessão: o JWT carrega `tv` (tokenVersion). Alterar papel ou desativar um
usuário incrementa o campo no banco e invalida todos os tokens dele na hora.

### Troca de senha obrigatória no primeiro acesso

A senha definida por outra pessoa é provisória por natureza. O usuário é marcado com
`mustChangePassword` quando:

- um admin **cria** a conta e `SENHA_EXIGE_TROCA_PRIMEIRO_ACESSO` está ativo (padrão: sim);
- um admin **redefine** a senha de alguém — sempre, independente do parâmetro;
- o **seed** cria o admin inicial, cuja senha vem do `.env`.

Com a marca ativa, a sessão é válida mas inútil: o `JwtAuthGuard` recusa **toda** rota com
`403` e `code: PASSWORD_CHANGE_REQUIRED`. Só passam as rotas marcadas com
`@AllowPasswordChangePending()` — `GET /auth/me`, `POST /auth/change-password` — e o logout,
que é público. Não é aviso na tela: é o backend recusando.

Ao trocar, o BFF incrementa `tokenVersion` (derruba as **outras** sessões da conta) e devolve
um cookie novo na mesma resposta, para quem trocou não ser expulso da própria tela.

A tela `/trocar-senha` fica **fora** do grupo `(app)`: quem cai nela por obrigatoriedade não vê
menu nem consegue navegar para outra rotina. A mesma tela serve para troca voluntária, pelo link
no menu lateral.

**Prazo da senha provisória** (`SENHA_PROVISORIA_VALIDADE_HORAS`, padrão 72h). Passado o prazo,
o login é recusado com `403 PROVISIONAL_PASSWORD_EXPIRED` e um admin precisa emitir outra — o
reset reinicia o prazo. Fecha a janela de uma provisória vazada e nunca usada. Zero desliga.

### Bloqueio por tentativas de login

`LOGIN_TENTATIVAS_MAX` (padrão 5) erros consecutivos de senha bloqueiam a conta por
`LOGIN_BLOQUEIO_MINUTOS` (padrão 15). Enquanto bloqueada, o login é recusado com
`403 ACCOUNT_LOCKED` **mesmo com a senha correta** — que é o objetivo. O contador zera a cada
login bem-sucedido e o prazo expira sozinho, sem job: a limpeza é preguiçosa, na tentativa
seguinte.

Um admin libera antes do prazo em Cadastros > Usuários (`POST /users/:id/unlock`), e a lista
mostra tentativas acumuladas e até quando a conta está bloqueada. `LOGIN_TENTATIVAS_MAX = 0`
desliga o bloqueio mas **continua contando** — o admin ainda enxerga o ataque na tela.

> **Decisão consciente:** a mensagem de conta bloqueada admite que a conta existe, o que permite
> enumeração de usuários. Como e-mail corporativo segue formato previsível
> (`nome.sobrenome@grupotrigo.com.br`), a proteção valeria pouco, enquanto um usuário barrado sem
> explicação gera chamado no suporte e novas tentativas. Credencial inválida continua com
> resposta genérica.

## Módulos

| Módulo | Rota | O que é |
|---|---|---|
| **Cadastros** | `/cadastros` | Cadastros base do portal. Hoje: Usuários (CRUD completo) |
| **Configurador** | `/configurador` | Parametrização sistêmica — o que muda o comportamento sem deploy |

A navegação sai toda de `apps/web/src/lib/navigation.ts`: a mesma estrutura alimenta o menu
lateral do desktop, a barra inferior do mobile e as telas índice de cada módulo. Item invisível
para quem não tem a permissão, nas três superfícies.

`/conta` reúne as opções do usuário logado: perfil, o que o perfil permite, trocar senha e sair.
Acesso pela aba "Conta" na barra inferior do mobile e, no desktop, por um item no rodapé do menu
lateral, junto ao nome e ao perfil de quem está logado.

Duas ações têm atalho fora da tela Conta, por frequência de uso:

- **Sair** fica no rodapé do menu lateral, a um clique — é a ação mais usada do bloco.
- No **mobile** o Sair fica só na Conta: botão destrutivo no canto superior da tela é fácil de
  acertar por engano no toque.
- **Trocar senha** é raro e vive apenas na tela Conta.

Fica **fora** de `NAV_SECTIONS` de propósito: não é módulo, e entrar lá viraria um grupo no menu
lateral ao lado de Cadastros e Configurador. Por isso é declarada direto no `AppShell`, junto com
o item Início, que segue a mesma lógica.

O menu lateral usa `sticky top-0 h-dvh`, com a lista de rotinas em `min-h-0 overflow-y-auto` e o
bloco do usuário em `shrink-0`. Sem isso o `aside`, sendo item flex, esticava até a altura do
conteúdo: em tela longa o botão Sair ia para o rodapé da página e saía da área visível.

### Configurador

Uma linha por parâmetro na tabela `Parameter`, no espírito da SX6 do Protheus: chave, rótulo,
grupo, tipo e valor.

| Tipo | Guarda | Escrita | Leitura interna |
|---|---|---|---|
| `STRING` / `NUMBER` / `BOOLEAN` | texto simples | `PATCH /parameters/:key` | `getString` / `getNumber` / `getBoolean` |
| `SECRET` | um segredo, cifrado | `PATCH /parameters/:key` | `getSecret` |
| `CREDENTIAL` | usuário + senha, cifrados juntos | `PATCH /parameters/:key/credential` | `getCredential` |

**Divisão de escopo com o `.env`** — a regra que evita duplicação:

| | `.env` | Configurador |
|---|---|---|
| Contém | o que o processo precisa para **subir**: banco, segredo do JWT, porta | o que muda **comportamento** em runtime |
| Muda com | deploy | um clique, por um Administrador |
| Exemplo | `DATABASE_URL`, `JWT_SECRET` | `SESSAO_DURACAO_HORAS`, `PROTHEUS_REST_URL` |

O catálogo é a fonte de verdade (`apps/bff/src/parameters/parameter-catalog.ts`). Parâmetro
novo = uma entrada lá + `pnpm db:seed`. O seed cria o que falta, atualiza rótulo/descrição e
**nunca sobrescreve valor customizado** — rodar de novo em produção é seguro.

Leitura tipada pelo resto da aplicação, com cache em memória invalidado a cada escrita:

```ts
const horas = await this.parameters.getNumber('SESSAO_DURACAO_HORAS', 8)
const url = await this.parameters.getString('PROTHEUS_REST_URL')
const exige = await this.parameters.getBoolean('SENHA_EXIGE_TROCA_PRIMEIRO_ACESSO', false)
```

`SESSAO_DURACAO_HORAS` já está ligado no `AuthService`: alterar o parâmetro muda a validade do
token nos próximos logins, sem restart. Valor fora da faixa de 1 a 720 horas é ignorado e o
serviço cai no `.env`, registrando aviso no log.

Parâmetro `SECRET` é **cifrado em repouso** com AES-256-GCM antes de ir para o banco e nunca
sai do servidor — a API devolve apenas `hasValue`. A chave fica em `PARAMETER_ENCRYPTION_KEY`
no `.env`, nunca no banco. Sem a chave, gravar um SECRET falha com erro explícito em vez de
gravar em texto claro.

> **Perder `PARAMETER_ENCRYPTION_KEY` torna os valores SECRET irrecuperáveis.** Gere uma por
> ambiente e guarde junto dos outros segredos de infraestrutura.

## Espelho de cadastros do Protheus

Cópia local dos cadastros do ERP, para o portal consultar sem bater no appserver a cada tela.
**O Protheus segue a fonte de verdade:** nada aqui é editado pelo portal, só sincronizado.

| Tabela do portal | Origem no Protheus | Chave |
|---|---|---|
| `tp_products` | `SB1020` + `SB1090` unificados | `(empori, code)` |
| `tp_customers` | `SA1090` | `(code, store)` |
| `tp_suppliers` | `SA2090` | `(code, store)` |
| `tp_companies` | `SYS_COMPANY` | `(code, branch)` |

### A coluna EMPORI

Coluna **do portal**, não do Protheus. Identifica a origem no cadastro unificado de produtos:

| Tabela de origem | `empori` |
|---|---|
| `SB1020` | `'02'` |
| `SB1090` | `''` (string vazia) |

**Vazio em vez de `NULL`, e isso importa:** o SQL Server trata `NULL` como valor *igual* em índice
único — já apanhamos disso no `tp_users`. Com `NULL`, dois produtos compartilhados com códigos
diferentes ainda funcionariam, mas a chave `(empori, code)` ficaria dependente de um índice
filtrado como o do `tp_users`. Com `''`, a unicidade é direta.

Há também `source_table`, com o nome da tabela de origem. `empori` é regra de negócio; `source_table`
é o fato bruto de onde a linha veio — útil quando aparecer uma terceira empresa.

Verificado: mesmo `code` nas duas origens coexiste, duplicata dentro da mesma origem é bloqueada,
e o filtro por origem funciona.

`tp_customers` e `tp_suppliers` **não têm `empori`**: a tabela é única e compartilhada entre as
empresas, então não há origem a distinguir. Se um dia surgir tabela por empresa, a coluna entra lá
também.

Toda tabela tem `synced_at`: sem ele não se distingue "registro não existe no Protheus" de
"sincronização nunca rodou".

### Ingestão: o REST padrão não serve

Sondagem no appserver de vocês (release da nuvem TOTVS, empresa 02) — **uma** autenticação, GETs
com `pageSize=1`:

| Endpoint | Resultado |
|---|---|
| `/api/framework/v1/users` | 200 — SCIM |
| `/api/framework/v1/groups` | 200 — SCIM |
| `/companies`, `/branches`, `/dictionary`, `/health` | `ECONNRESET` |
| 11 variantes de produto/cliente/fornecedor | `ECONNRESET` ou 404 |

O appserver **derruba a conexão** em rota não roteada, em vez de responder 404 — daí o
`ECONNRESET`. Comparado com `/users` e `/groups` respondendo 200, fica claro que não é rede nem
token: **esses cadastros não existem no REST padrão deste release.**

Caminho escolhido: **endpoint TLPP customizado**. O fonte está em
[`protheus/GTRWSRPORTALTRIGO.tlpp`](protheus/GTRWSRPORTALTRIGO.tlpp), com o contrato e as instruções de compilação em
[`protheus/README.md`](protheus/README.md).

```
GET /portal/v1/produtos      -> SB1 da empresa do tenantId
GET /portal/v1/clientes      -> SA1
GET /portal/v1/fornecedores  -> SA2
GET /portal/v1/empresas      -> SYS_COMPANY
```

Duas decisões de desenho:

- **A empresa vem do `tenantId`**, não do nome da tabela. O fonte usa `RetSQLName()`, então o
  portal chama uma vez por empresa (`02` → `SB1020`, `90` → `SB1090`). Nome físico escrito no
  fonte quebraria em ambiente com outro código de empresa, e nome de tabela vindo do cliente
  seria superfície de injeção.
- **A regra do EMPORI fica no portal.** A resposta devolve `sourceTable` (o fato); a tradução
  para `empori` é do BFF. Mudar a regra no portal é um deploy; no RPO é recompilar e reiniciar
  o appserver.

## Conexão com o Protheus

Autenticação por **OAuth2 password grant** com uma conta de serviço: o BFF envia usuário e senha
para `POST {url}/api/oauth2/v1/token?grant_type=password`, recebe `access_token` e
`refresh_token`, e usa `Authorization: Bearer` nas chamadas às rotinas.

Usuário e senha ficam num **único parâmetro** `PROTHEUS_CREDENCIAL`, do tipo `CREDENTIAL`: o par
é serializado em JSON e cifrado como um bloco só. Motivos: não existe estado meio-configurado
(usuário novo com senha velha), a senha nunca passa pelo endpoint genérico de `value` — que
registra o novo valor no log — e o formulário fica coerente com o que a pessoa tem em mãos.

O `PATCH /parameters/:key/credential` é o único caminho de escrita; o endpoint genérico recusa
parâmetro `CREDENTIAL` com 400. A API devolve apenas o **usuário** (`credentialUser`) e
`hasValue` — a senha nunca trafega, nem para o administrador.

O campo de senha na tela tem botão **Mostrar/Ocultar**. Digitar credencial de ERP às cegas é a
maior fonte de erro nessa tela, e quem configura já está com o valor em mãos.

Configuração em Configurador > Parâmetros (grupo Protheus); diagnóstico e teste de autenticação
em Configurador > Conexão Protheus.

**Um token para todo o portal.** Cada autenticação no appserver ocupa thread e conta como
sessão/licença — um login por requisição derruba o ambiente sob carga, e é o erro mais comum em
integração com Protheus. O `ProtheusAuthService` mantém um único token, renovado antes de vencer.
Chamadas simultâneas com token vencido são serializadas num único `Promise`: dez requisições
geram **uma** autenticação, não dez.

O `ProtheusClient` é o único caminho para o ERP — nenhum módulo chama `fetch` direto. Ele:

- injeta o Bearer e renova o token quando necessário;
- refaz **uma** vez quando o Protheus responde 401 (token revogado do outro lado, comum após
  restart do appserver) e para aí, sem laço;
- envia `tenantId: empresa,filial` em toda chamada, com override por chamada quando preciso;
- aplica timeout de `PROTHEUS_TIMEOUT_SEGUNDOS`;
- traduz o erro do ERP preservando `detailedMessage` e `errorCode`, e **repassa o status**
  (um 404 de registro inexistente não vira 500).

Como consumir num módulo novo:

```ts
constructor(private readonly protheus: ProtheusClient) {}

const titulos = await this.protheus.get<Titulo[]>('/api/financeiro/v1/titulos', {
  query: { page: 1, pageSize: 50 },
  filial: '0201',
})
```

> **Use uma conta de serviço dedicada, não a conta de uma pessoa.** Com usuário pessoal: a senha
> expira e derruba a integração, toda ação do portal fica auditada no Protheus como se fosse
> aquela pessoa, as permissões são mais amplas que o necessário, e desligar o funcionário mata a
> integração.

### Como adicionar um módulo novo

1. `packages/core/src/auth/permissions.ts` — declare as permissões (`pedidos:read`, …) e
   distribua nos papéis.
2. `apps/bff/src/<modulo>/` — módulo Nest com controller + service.
3. `packages/api-client/src/<modulo>.ts` — funções tipadas e a entrada em `client.ts`.
4. `apps/web/src/lib/navigation.ts` — uma seção (módulo novo) ou um item (rotina nova dentro
   de um módulo existente). Menu, barra inferior e tela índice se atualizam sozinhos.
5. Rota que mude de lugar entra em `LEGACY_ROUTES` no `middleware.ts`, para o link antigo
   não morrer.

## Banco de dados

**SQL Server** é o alvo (Azure SQL hoje, instância local na implantação), via Prisma com
provider `sqlserver`. Para desenvolver na máquina sem nenhum servidor de banco, existe também
um modo **SQLite em arquivo** — ver [Dois bancos, um schema](#dois-bancos-um-schema).

Configure `DATABASE_URL` em `apps/bff/.env` (formato e pegadinhas documentados no `.env.example`):

```
sqlserver://SERVIDOR.database.windows.net:1433;database=BANCO;user=USUARIO;password=SENHA;encrypt=true;trustServerCertificate=false
```

Depois:

```bash
pnpm --filter @trigo/bff db:push          # cria as tabelas + aplica prisma/sql/
pnpm --filter @trigo/bff db:migrar-sqlite # (uma vez) traz os dados do SQLite antigo
pnpm --filter @trigo/bff db:seed          # sincroniza o catálogo de parâmetros
```

### Dois bancos, um schema

O Prisma aceita um provider por schema, então rodar SQLite local exigiria um segundo schema.
Manter dois à mão é garantia de divergência, por isso o de SQLite é **gerado** a partir do de
SQL Server:

```
prisma/schema.prisma          SQL Server — fonte de verdade, é a produção
prisma/schema.sqlite.prisma   GERADO, só para desenvolvimento local
```

A transformação é mecânica: troca o provider, remove os 60 `@db.*` (tipos nativos de SQL Server)
e os `map:` de nome de constraint, e aponta para `DATABASE_URL_SQLITE`. **Nome de tabela e de
coluna não muda** — a convenção `tp_`/snake_case vale nos dois, e consulta crua escrita para um
funciona no outro.

`pnpm typecheck` falha se o schema de SQLite estiver desatualizado, do mesmo jeito que já falha
para o `deploy/criar-banco.sql`. Mudou o schema, regere.

#### Subir o ambiente local do zero

```bash
pnpm --filter @trigo/bff db:local
```

Gera o schema, cria o `prisma/dev.db`, aplica o índice parcial, gera o client e roda o seed.
Não toca em nada de SQL Server.

#### Alternar entre os dois

O que decide qual banco vale é **o schema com que o Prisma Client foi gerado**, não o `.env`:
as duas conexões convivem lá (`DATABASE_URL` e `DATABASE_URL_SQLITE`), justamente para não ter
que editar arquivo a cada troca.

```bash
pnpm --filter @trigo/bff db:sqlite     # aponta o client para o SQLite (não recria o banco)
pnpm --filter @trigo/bff db:sqlserver  # volta para SQL Server
```

**Atenção:** `pnpm build` roda `prisma generate` para o schema de SQL Server, porque é o build
de produção. Depois de um build, o client volta para SQL Server — rode `db:sqlite` para
retomar o modo local.

#### Duas diferenças de comportamento que importam

| | SQL Server | SQLite |
|---|---|---|
| Comparação de texto | ignora caixa (collation CI) | **diferencia** caixa |
| Unicidade parcial | índice filtrado T-SQL, `prisma/sql/` | índice parcial, `prisma/sql-sqlite/` |

A busca por nome, e-mail ou descrição de produto ignora maiúsculas em SQL Server por causa da
collation, e o Prisma não suporta `mode: 'insensitive'` no provider `sqlserver` — quem ignora a
caixa é o banco. No SQLite ela diferencia. É diferença de ambiente, não defeito do portal.

A unicidade de `(provider, external_id)` só quando `external_id` existe está nos dois, com a
mesma cláusula `WHERE`; só a sintaxe do `CREATE INDEX` difere.

### Convenção de nomes

Toda tabela nova segue isto. O modelo Prisma continua PascalCase em inglês, com `@@map`/`@map`
traduzindo — então `prisma.user.findMany()` não muda no código, e o SQL fica no padrão de SQL.

| Elemento | Padrão | Exemplo |
|---|---|---|
| Tabela | `tp_<plural_snake_case>` | `tp_users`, `tp_parameters` |
| Coluna | `snake_case` | `password_hash`, `last_login_at` |
| Booleano | prefixo `is_` / `has_` / `must_` | `is_active`, `must_change_password` |
| Data/hora | sufixo `_at` ou `_until` | `created_at`, `locked_until` |
| Chave primária | `tp_<tabela>_pk` | `tp_users_pk` |
| Único | `tp_<tabela>_<colunas>_uq` | `tp_users_email_uq` |
| Índice | `tp_<tabela>_<colunas>_idx` | `tp_users_is_active_idx` |

Nomes de constraint são fixados com `map:` de propósito: sem isso o Prisma inventa o nome
(`User_email_key`) e a convenção se perde na primeira migração.

**Por que o prefixo `tp_`:** identifica as tabelas do portal caso o banco venha a hospedar outra
coisa, é estável (tabela não é renomeada quando muda de módulo) e elimina colisão com palavra
reservada. Três nomes que quebrariam sem ele: **`User`** (erro 156 no SQL Server — toda consulta
bruta exigia `dbo.[User]`), **`group`** (de `GROUP BY`) e **`value`**. Viraram `tp_users`,
`group_name` e `current_value`.

**Chave primária:** `id` surrogate (`uuid`) em tabela de entidade. `tp_parameters` é exceção
consciente e documentada: `key` **é** a identidade do parâmetro — catálogo, API e cache todos o
endereçam por ela, e um `id` ali seria coluna que ninguém usa.

**Toda tabela leva** `created_at` e `updated_at`.

#### Como renomear sem perder dados

Trocar `@@map` não é um rename para o Prisma: ele vê uma tabela nova e outra sobrando, e o
`db push` **derrubaria a antiga com os dados dentro**. Por isso `db:push` roda
`scripts/renomear-para-convencao.ts` **antes** do push — `sp_rename` altera no lugar. O script é
idempotente: em banco novo, criado já com os nomes finais, é no-op.

Uma ordem importa e custou um erro: **índice filtrado precisa cair antes de renomear a coluna.**
SQL Server recusa com erro 5074 (`The index X is dependent on column Y`) porque o predicado
(`WHERE external_id IS NOT NULL`) fica amarrado ao nome antigo. Índice comum sobrevive; filtrado
não. O script derruba e `aplicar-sql.ts` recria com o nome novo — há uma janela curta, dentro da
migração, sem a constraint de unicidade.

### Três armadilhas do SQL Server que o schema já resolve

Nenhuma delas aparece em teste com pouco dado; todas apareceriam em produção.

| Problema | Por que quebra | Solução no repositório |
|---|---|---|
| `String` sem tamanho em coluna indexada | Vira `NVARCHAR(1000)` = 2000 bytes, acima do limite de chave de índice (900 clustered / 1700 nonclustered) — a PK e o unique de e-mail **não são criados** | `@db.NVarChar(n)` explícito em toda coluna indexada |
| `@@unique([provider, externalId])` | SQL Server trata `NULL` como valor **igual**; todo usuário local tem `externalId` nulo, então o segundo cadastro violaria a constraint | Índice filtrado (`WHERE externalId IS NOT NULL`) em `prisma/sql/001-indice-filtrado.sql` |
| `value` com credencial cifrada | Senha no limite do schema gera ciphertext de ~1026 caracteres, acima de `NVARCHAR(1000)` | `@db.NVarChar(Max)` |

O Prisma não declara índice filtrado, então ele vive em `prisma/sql/` e é aplicado por
`scripts/aplicar-sql.ts` — que o `db:push` já chama. Os arquivos são idempotentes.

### Script de criação para outra instância

`apps/bff/deploy/criar-banco.sql` cria a estrutura completa num banco novo — homologação,
produção, outra unidade. **É gerado, não escrito à mão:**

```bash
pnpm --filter @trigo/bff db:gerar-script      # regera a partir do schema
pnpm --filter @trigo/bff db:verificar-script  # falha se estiver desatualizado
```

O DDL sai do próprio `prisma/schema.prisma` (via `prisma migrate diff --from-empty`), somado aos
objetos de `prisma/sql/` e aos parâmetros do catálogo. Script escrito à mão envelhece em silêncio;
gerado, acompanha o schema.

**O verificador roda dentro do `typecheck`** e sai com código 1 se o schema mudou e o arquivo não
foi regerado — então esquecer não passa batido, nem localmente nem em CI.

O que o script faz e o que deliberadamente não faz:

| Faz | Não faz |
|---|---|
| Cria `tp_users` e `tp_parameters` com chaves e índices | **Não cria o database** — no Azure isso é infraestrutura, com escolha de tier e custo |
| Cria o índice filtrado que o Prisma não declara | **Não cria o administrador inicial** — senha não entra em arquivo versionado; use `db:seed` |
| Insere os 16 parâmetros no padrão de fábrica (`MERGE`, idempotente) | Não define `DATABASE_URL` nem `PARAMETER_ENCRYPTION_KEY` |

Cabeçalho do arquivo traz o passo a passo e uma assinatura do conteúdo, para conferência.

### Onde a configuração de banco fica visível no portal

**Configurador > Banco de dados** (`/configurador/banco`) mostra servidor, porta, banco, usuário,
latência, versão do SQL Server e contagem de registros — **somente leitura**. A senha nunca
trafega: o parser da `DATABASE_URL` descarta o campo no ponto de leitura.

**Os dados de conexão vivem em `DATABASE_URL`, no `.env` do servidor.** Não são editáveis pelo
portal, por dois motivos:

1. **Dependência circular.** Os parâmetros ficam gravados neste banco; ler um parâmetro que diz
   onde o banco está exigiria estar conectado a ele.
2. **Risco operacional.** Conexão editável por tela é um caminho para trancar todo mundo fora do
   sistema com um erro de digitação — inclusive quem foi corrigir.

Trocar de banco é operação de servidor: editar o `.env` e reiniciar o BFF. `DATABASE_URL`,
`JWT_SECRET` e `PARAMETER_ENCRYPTION_KEY` são a categoria "precisa existir antes do processo
subir".

O que **é** parametrizável é o comportamento das consultas, no grupo **Banco de dados**:

| Parâmetro | Efeito |
|---|---|
| `BANCO_LIMITE_REGISTROS_CONSULTA` | Teto de linhas por listagem, mesmo que a tela peça mais. Antes era `100` fixo no código |

### Diferenças de comportamento em relação ao SQLite

- **Collation case-insensitive** (padrão do Azure SQL): a busca por nome/e-mail em
  Cadastros > Usuários passa a ignorar maiúsculas, o que antes não acontecia. É melhoria.
- **`prisma migrate dev` precisa de shadow database**, e o usuário do Azure SQL normalmente não
  tem permissão para criar banco. Enquanto o projeto está sendo estruturado, use `db:push`. Ao
  entrar em produção, configure `shadowDatabaseUrl` ou gere as migrations com `migrate diff`.
- **Firewall:** libere o IP em SQL server > Networking > Firewall rules. Sem isso o erro é
  timeout, não uma mensagem de permissão.
- **Auto-pause do tier serverless.** O banco hiberna por inatividade e a primeira conexão
  dispara o resume, que leva de 30 a 60 s. Nesse intervalo o erro é
  `Database 'trigo_portal_db' is not currently available. Please retry the connection later.` —
  a credencial está correta, o banco só está acordando. **Consequência para o usuário:** quem
  abrir o portal depois de horas de inatividade pode ver erro no primeiro acesso. Ver pendência
  de retry.
- **Client desatualizado dá erro enganoso.** Se o `prisma generate` não rodar depois de trocar o
  provider, o erro é `Validation Error Count: 1` — parece problema de conexão, mas é o client
  gerado para o provider antigo recusando a URL nova.

O SQLite antigo ficou preservado em `apps/bff/prisma/dev.db.backup-antes-azure`.

## Layout

Estrutura no padrão **Architect UI**, reproduzida com Tailwind — **sem** Bootstrap, jQuery ou
reactstrap no projeto. O template original é Bootstrap 4 + reactstrap, que conviveria mal com
Tailwind v4 e tem incompatibilidades com React 19; então o que importa (a estrutura visual) foi
reescrito com os tokens da marca.

**Desktop:** barra superior clara com a marca, botão de recolher e atalho para a Conta; menu
lateral grafite com ícone por item, recolhível para 4,75rem (só ícones, com `title` como dica);
conteúdo com cabeçalho de página padronizado. A preferência de menu recolhido fica em
`localStorage`, lida após a montagem para não divergir do HTML do servidor.

**Mobile:** mantido o padrão já validado — cabeçalho grafite e barra inferior de abas com ícone.
Menu lateral em tela pequena viraria gaveta sobreposta, pior no toque que abas fixas.

Componentes que padronizam as telas:

| Componente | Papel |
|---|---|
| `PageTitle` | Cabeçalho de página: ícone, módulo, título, descrição e área de ações |
| `Card` | Cartão com padding e cabeçalho opcional (`title` + `actions`) |
| `CardFlush` | Cartão sem padding, para lista que ocupa a largura toda |
| `Icon` | Ícones inline, sem biblioteca externa |

Sombras em `--shadow-card` / `--shadow-card-hover`: difusas e de baixa opacidade, que é o que dá
ao Architect UI a sensação de cartão flutuando sem peso visual.

## Identidade visual

Extraída de https://grupotrigo.com.br (variáveis CSS do site e logo oficial). Todos os
tokens vivem em `apps/web/src/app/globals.css` — é o único arquivo a mudar se a marca mudar.

| Token do site | Valor | Uso no portal |
|---|---|---|
| `--amarelo-trigo` | `#fab900` | `brand-500` — ação primária, item de menu ativo, foco |
| `--cinza-escuro` | `#2f3237` | `ink-900` — menu lateral, cabeçalho, texto principal |
| `--cinza-trigo` | `#6a6a6a` | `ink-500` — texto secundário |
| `--cinza-claro` | `#cccccc` | `ink-200` / bordas |
| `--cinza-china` | `#f0f0f0` | `ink-100` — fundo da aplicação |
| `--vermelho-china` | `#e33324` | `danger-500` — bordas e destaque |
| `--vermelho-escuro` | `#96222b` | `danger-700` — botão destrutivo |
| Montserrat | 400/500/600/700 | via `next/font` (servido local, sem request ao Google) |

### Marca e ícones

O símbolo (espiga + anel segmentado com as cores das marcas do grupo) vive em
`apps/web/public/` e é usado pelo componente `Logo`. Todos os arquivos saem de **uma única
origem** via `apps/web/scripts/gerar-icones.mjs`:

| Arquivo | Uso |
|---|---|
| `logo-mark.png` | 144×144 com máscara circular — menu lateral e tela de login |
| `icon-192.png` / `icon-512.png` | ícones do PWA (`purpose: any`) |
| `icon-maskable-512.png` | marca a 68% — o Android recorta em círculo na zona segura de 80% |
| `apple-touch-icon.png` | 180×180, iOS |
| `favicon-32.png` / `favicon-16.png` | recorte só da espiga — o anel não se lê a 16px |

Para regerar a partir de um arquivo melhor:

```bash
pnpm add -D sharp --filter @trigo/web && node apps/web/scripts/gerar-icones.mjs caminho/logo.png
```

> A origem atual é um WebP 474×474 com compressão perdida e sem transparência, obtido de
> cache de busca — não do arquivo original. Vale substituir pelo arquivo do manual de marca
> e rodar o script novamente.

**Regra de contraste do amarelo:** `#fab900` com texto branco dá 1,8:1 e reprova em WCAG AA.
Sobre amarelo vai sempre tinta `ink-900` (7,35:1) — é o mesmo uso que o site institucional
faz nos badges de categoria. Mesmo motivo pelo qual o botão destrutivo usa `--vermelho-escuro`
e não `--vermelho-china` (branco sobre o china dá 4,41:1, reprova por pouco).

Todos os pares em uso foram medidos e passam AA:

| Par | Razão |
|---|---|
| tinta sobre amarelo (botão primário) | 7,35:1 |
| branco sobre grafite (menu ativo) | 12,87:1 |
| `ink-200` sobre grafite (menu inativo) | 8,01:1 |
| amarelo sobre grafite ("Sair" mobile) | 7,35:1 |
| branco sobre vermelho-escuro | 8,20:1 |
| `ink-500` sobre branco (texto auxiliar) | 5,41:1 |

## PWA — limites conhecidos no iOS

- **Push notification** só funciona se o usuário fizer "Adicionar à Tela de Início"
  (iOS 16.4+). Se aprovação por push virar requisito central, é o gatilho para começar o app nativo.
- **Storage local** pode ser limpo pelo Safari após ~7 dias sem uso: não dependa de
  offline pesado.
- O service worker **não** cacheia `/api/` de propósito — resposta de API contém dado de
  sessão e cachear vazaria informação entre contas no mesmo dispositivo.

## Pendências conhecidas

- [ ] Refresh token com rotação (hoje a sessão dura 8h e expira seca).
- [ ] **Invalidação distribuída do cache de parâmetros.** O cache é por processo; com mais de
      uma instância do BFF, alterar parâmetro só afeta a instância que atendeu o request.
      Resolver com Redis pub/sub antes de escalar horizontalmente.
- [ ] Log de auditoria (quem criou/alterou/desativou quem). Parâmetro já registra
      `updatedBy`/`updatedAt`; usuário ainda não tem histórico.
- [ ] Trocar a conta de integração do Protheus por uma **conta de serviço dedicada** (hoje está
      configurada uma conta pessoal).
- [ ] **Retry na conexão para o auto-pause do Azure SQL serverless.** Hoje o primeiro acesso
      depois da hibernação falha para o usuário. Precisa de retry com backoff no `PrismaService`
      (ou desligar o auto-pause no Azure, que muda o custo).
- [ ] **Rotacionar a senha do `trigoportal.admin`**: ela foi transmitida por chat durante a
      configuração.
- [ ] Trocar `trigoportal.admin` (login administrador do **servidor** Azure SQL) por um usuário de
      aplicação com permissão só no banco `trigo_portal_db` — `db_datareader` + `db_datawriter`,
      mais DDL enquanto houver migração de schema.
- [ ] Cache de resposta do Protheus: `PROTHEUS_CACHE_MINUTOS` existe e **ainda não tem efeito** —
      falta a camada de cache no `ProtheusClient`, que é o que protege licença do appserver em
      tela com refresh.
- [ ] Rotação da `PARAMETER_ENCRYPTION_KEY` (recifrar os SECRET com chave nova sem downtime).
- [ ] Bloqueio por tentativas é **por conta, não por origem**: um ataque distribuído em muitas
      contas não é contido, e um atacante pode bloquear a conta de alguém de propósito (negação
      de serviço). Rate limit por IP no BFF ou no proxy cobre esse flanco.
- [ ] Teste automatizado da trava de "último administrador ativo" — implementada, mas não
      exercitada de ponta a ponta (ver observação abaixo).
- [ ] Substituir a origem dos ícones pelo arquivo do manual de marca (o atual é um WebP
      474×474 com perda) e rodar `apps/web/scripts/gerar-icones.mjs` de novo.
- [ ] Avaliar usar o wordmark `trigo-franquias.svg` (220×34, vetorial) no menu lateral,
      no lugar do símbolo + texto.
- [ ] Testes automatizados (Vitest no core/BFF, Playwright no fluxo de login).
- [ ] Validar `NEXT_OUTPUT=standalone` num build Linux/CI (no Windows os symlinks são negados).
- [ ] Migrar `package.json#prisma` para `prisma.config.ts` (deprecado no Prisma 7).

> **Windows — duas armadilhas no build:**
>
> 1. Rode `pnpm build` com o `pnpm dev` **parado**: o dev server mantém lock na
>    `query_engine-windows.dll.node` do Prisma e no diretório `.next`. Para compilar sem parar
>    o dev, use `NEXT_DIST_DIR=.next-build` no app web.
> 2. O `output: 'standalone'` do Next cria symlinks, e o Windows nega isso sem Modo de
>    Desenvolvedor — o build falhava com `EPERM` **depois** de já ter compilado tudo. Agora ele
>    só é ativado com `NEXT_OUTPUT=standalone`, que é o que o CI/Docker deve usar.
