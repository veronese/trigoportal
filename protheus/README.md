# Fontes Protheus do Portal Trigo

Fontes AdvPL/TLPP que o portal consome. Versionados aqui, junto do contrato que servem —
se a resposta mudar, o commit mostra as duas pontas mudando juntas.

| Fonte | O que faz |
|---|---|
| `GTRWSRPT.tlpp` | Web service REST de cadastros. Hoje: **empresas e filiais** |

## Fontes que o portal consome mas NÃO versiona aqui

| Serviço | Onde vive | O que o portal usa |
|---|---|---|
| `zWsProdutos` | `GTRWSRPROD.prw`, na pasta de fontes do ambiente | `GET /zWsProdutos/get_all` — carga de produtos |

`zWsProdutos` é anterior ao portal (gerado pelo Autumn Code Maker, 05/2025) e serve outros
consumidores. Não está copiado para cá de propósito: duas cópias do mesmo fonte divergem, e a
autoridade sobre ele não é deste projeto. O que o portal precisa saber do contrato está em
[`apps/bff/src/products/zws-produtos.client.ts`](../apps/bff/src/products/zws-produtos.client.ts),
que é o único ponto do código acoplado a esse formato.

O escopo começa mínimo de propósito. **Produtos vêm do `zWsProdutos`**, que já existia — não
há por que reescrever o que funciona. Clientes e fornecedores entram como mais um `WSMETHOD`
dentro deste `WSRESTFUL`, se não houver endpoint pronto para eles também.

---

## Como compilar

1. Copie `GTRWSRPT.tlpp` para a pasta de fontes do ambiente.
2. Compile no TOTVS Developer Studio.
3. **Reinicie o job REST** do appserver. Rota nova não aparece sem isso — o serviço monta a
   tabela de rotas na subida.
4. Confira se respondeu:

```
GET {rest}/portal/v1/empresas
Authorization: Bearer <token>
```

---

## Contrato

```
GET /portal/v1/empresas
```

Sem parâmetros. Não usa `tenantId`: `SYS_COMPANY` **é** a tabela que define as empresas e
filiais, então não há empresa a selecionar antes de lê-la.

### Resposta

```json
{
  "total": 2,
  "items": [
    {
      "empresa": "02",
      "filial": "0201",
      "nomeFilial": "Matriz Sao Paulo",
      "razaoSocial": "Grupo Trigo Alimentos S.A.",
      "nomeFantasia": "Grupo Trigo",
      "cnpj": "00000000000191",
      "recno": 1
    }
  ]
}
```

Campos character vêm com `RTrim`: sem isso o portal gravaria `"02        "` como código do
banco de dados Protheus, que é `CHAR` de tamanho fixo.

---

## Decisões desta versão

**Sem paginação.** O cadastro tem dezenas de linhas. Paginar aqui seria complexidade sem
ganho — e a paginação volta junto com produtos e clientes, onde o volume justifica.

**Sem statement preparado.** A consulta não recebe nenhum valor do cliente, logo não existe
valor dinâmico a fazer bind nem superfície de injeção. Quando entrar query string, aí sim
`FWExecStatement` com `?`.

**Campos mínimos.** Só os seis campos de `SYS_COMPANY` presentes em qualquer versão do
Protheus. Se precisar de endereço, inscrição estadual ou telefone, é acrescentar a coluna no
`SELECT` e a chave no `JsonObject` — duas linhas por campo.

---

## Dois erros de compilação que já custaram tempo aqui

### `User Function` tem limite de 10 caracteres no nome

O compilador guarda `User Function` no RPO como `U_` + nome, e o nome não passa de 10
caracteres. `Static Function` não tem esse limite. Auxiliares internas devem ficar `Static`
de qualquer forma: não poluem o nome global do RPO e dispensam o prefixo `U_` na chamada.

### `PATH` é o que define a rota

Sem a cláusula `PATH`, o roteamento cai no nome do serviço (`{rest}/GTRPTRIGO/empresas`) e o
contrato acima deixa de valer. `WSSYNTAX` sozinho **não** define rota — ele só alimenta a
documentação do endpoint.

---

## Cuidados aplicados na consulta

- `D_E_L_E_T_ = ' '` — sem isso vêm registros logicamente excluídos
- `WITH (%nolock%)` traduzido por `ChangeQuery`, para não disputar lock com o ERP
- Só os campos necessários, nunca `SELECT *`
- `ORDER BY` na ordem da chave (`M0_CODIGO, M0_CODFIL`), para o otimizador aproveitá-la
- Alias fechado antes de montar a resposta, com `Select() > 0` cobrindo o caso de falha —
  alias vazado esgota área de trabalho do appserver
- `GetArea()` / `RestArea()` em volta
