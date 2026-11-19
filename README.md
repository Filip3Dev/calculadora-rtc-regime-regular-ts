# Calculadora de Tributos RTC — Regime Regular (TypeScript)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%E2%89%A522-339933.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6.svg)
![SQLite](https://img.shields.io/badge/SQLite-somente%20leitura-003B57.svg)

Porte **TypeScript** da [Calculadora de Tributos da Reforma Tributária do Consumo](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular) — a API de código aberto da **Receita Federal** que calcula a **CBS**, o **IBS** e o **Imposto Seletivo** (LC 214/2025) nas operações do regime regular.

O motor reproduz o cálculo oficial com **paridade estrita de saída** — mesmos valores, mesmos grupos de tributação, mesma memória de cálculo (caractere a caractere) e mesmo catálogo de erros `REG`/`CAL` — comprovada por *golden tests* que executam as próprias suítes de teste do projeto original contra este motor.

**Destaques deste porte:**

- ⚖️ **Paridade comprovada** — regressão oficial de 262 objetos e cenários de compra governamental passam campo a campo
- 🚫☕ **Sem Java** — o banco SQLite oficial é gerado por um *runner* TypeScript a partir dos mesmos scripts Flyway do original
- 🖥️ **Playground web incluso** — monte a operação, calcule e veja a memória de cálculo por tributo
- 🧩 **Geração e validação de XML** do grupo RTC para 7 tipos de DF-e, contra os XSDs oficiais da SEFAZ

> **Aviso:** projeto independente, de código aberto, **não oficial**. As alíquotas de 2026 na base são valores de referência (ainda não definidos em lei) — a calculadora oficial as trata como dados de simulação, e este porte reproduz esse comportamento.

---

## Público-Alvo

- Empresas de tecnologia que precisam embutir o cálculo RTC em stacks Node.js/TypeScript
- Desenvolvedores que estudam a Reforma Tributária do Consumo e sua implementação de referência
- Contribuintes em geral que desejam simular operações do regime regular

---

## Funcionalidades

Todos os caminhos começam com `http://localhost:8080/api/calculadora`. A lista completa está no Swagger (`http://localhost:8080/api/swagger`).

### Cálculo

| Funcionalidade | Endpoint |
|---|---|
| Cálculo de tributos (a operação inteira falha no primeiro erro) | `POST /regime-geral` |
| Cálculo com observabilidade (erros por item, sem interromper os demais) | `POST /observabilidade/regime-geral` |
| Descrição de um código de erro da observabilidade | `GET /observabilidade/erros?codigo=REG-011` |
| Base de cálculo unificada NF-e/NFC-e (transição 2026–2033) | `POST /base-calculo/base-calculo-unificada` |
| Base de cálculo de CBS e IBS em NFS-e | `POST /nfse/base-calculo` |
| Bases unificadas RG e SN da NFS-e (MEI, locação 99.03, salão/profissional parceiro, documentos de ajuste) | `POST /base-calculo/base-calculo-unificada-nfse` |
| Indicadores de operação da NFS-e (validação de combinação, locais, situações por NBS) | `GET/POST /nfse/indicador-operacao`, `/nfse/local-operacao`, `/nfse/locais-fornecimento` |
| Cálculo de CBS/IBS em pedágio (distribuição por praça proporcional à extensão do trecho) | `POST /pedagio` |

### XML

| Funcionalidade | Endpoint |
|---|---|
| Geração do XML do grupo de tributação RTC a partir do ROC (NF-e, NFC-e, CT-e, CT-e Simplificado, BP-e, BP-e TM, NF3-e) | `POST /xml/generate?tipo=nfe` |
| Tipos de documento suportados na geração e na validação | `GET /xml/generate` |
| Validação de XML (grupo ou nota completa) contra o XSD oficial | `POST /xml/validate?tipo=nfe&subtipo=grupo` |

### Dados abertos

| Funcionalidade | Endpoint |
|---|---|
| CST e classificações tributárias (cClassTrib), inclusive por CST | `GET /dados-abertos/situacoes-tributarias/cbs-ibs`, `GET /dados-abertos/classificacoes-tributarias[...]` |
| Fundamentações legais | `GET /dados-abertos/fundamentacoes-legais` |
| NCM e NBS (consulta por prefixo, paginada) | `GET /dados-abertos/ncm`, `GET /dados-abertos/nbs` |
| Alíquotas de referência (CBS, IBS-UF, IBS-Município) | `GET /dados-abertos/aliquota-referencia` |
| UFs, municípios e tipos de documento fiscal | `GET /dados-abertos/ufs`, `/municipios`, `/tipos-documento` |
| Redutores de compra governamental, transferências de CBS e unidades de medida | `GET /dados-abertos/redutores-compra-governamental`, `/transferencias-cbs`, `/unidades-medida` |
| Versão da base de dados embutida | `GET /versao` |

---

## Arquitetura

```
calculadora-rtc-regime-regular-ts/
├── packages/
│   └── core/              # Motor de cálculo (sem HTTP) — reutilizável como biblioteca
│       ├── src/
│       │   ├── model/     # JBD (emulação de BigDecimal Java com escala), tipos do ROC
│       │   ├── db/        # Repositórios SQLite ro + cache LRU/TTL + runner de migrações
│       │   ├── expression/# Avaliador das expressões tributárias (ADR001, sandbox nativo)
│       │   ├── services/  # Cadeia de cálculo, NFS-e, pedágio, observabilidade
│       │   └── xml/       # XmlWriter JAXB-compatível + tipos RTC + geradores por DF-e
│       └── test/          # Golden tests de paridade + testes de geração XML
├── apps/
│   ├── api/               # API NestJS (Swagger em /api/swagger)
│   └── playground/        # SPA React + Vite
└── db/                    # Scripts SQL oficiais (Flyway) + XSDs SEFAZ + banco gerado
```

---

## Como este porte foi feito

O ponto de partida foi a leitura sistemática do código-fonte Java do projeto original (Spring Boot 3, Java 21) e dos seus [10 ADRs](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular/tree/main/docs/adr). As decisões arquiteturais foram preservadas:

1. **O banco de dados é o mesmo.** Os scripts SQL oficiais (baseline `B0001` + 58 migrações do [Flyway](https://flywaydb.org/)) são executados por um *runner* TypeScript que replica a ordem, o padrão transacional (`PRAGMA defer_foreign_keys`) e os *callbacks* do build original — sem exigir Java. O resultado é o mesmo SQLite somente-leitura com 54 tabelas: classificações tributárias, **expressões de cálculo**, alíquotas, NCM/NBS, municípios etc.

2. **O cálculo continua dirigido por expressões (ADR001).** As fórmulas fiscais vivem na tabela `TRATAMENTO_TRIBUTARIO` como texto (ex.: `baseCalculoInformada-impostoSeletivoInformado+impostoSeletivoCalculado`) e são avaliadas em runtime por um parser aritmético próprio com as mesmas semânticas do Apache JEXL do original: variáveis não informadas valem zero, atalho para expressão de variável única e *sandbox por construção* (a gramática só aceita identificadores, literais, `+ - * /` e parênteses — não existe sintaxe para chamar funções ou acessar propriedades).

3. **A aritmética é idêntica à do Java.** A classe `JBD` emula `java.math.BigDecimal` **incluindo a escala**, que se propaga pelas operações e vaza para a memória de cálculo (ex.: `"R$ 200.00000000"`, `"0.900000%"`): 8 casas internas com `HALF_EVEN` (art. 349, § 14, da LC 214/2025, como no ADR003 do original) e divisões com `MathContext.DECIMAL128` (34 dígitos), sobre [decimal.js](https://mikemcl.github.io/decimal.js/).

4. **Porte fiel dos serviços.** A cadeia `CalculadoraService → ProcessamentoItemService → CalculoTributoService → CalculoCbsIbsService/CalculoImpostoSeletivoService` foi portada método a método, com os SQLs nativos dos repositórios JPA copiados para *prepared statements* (incluindo o vínculo NCM↔cClassTrib por **prefixo** e a lógica de exceções dos anexos). Os geradores de XML seguem os `propOrder` dos modelos JAXB e a saída do `XmlWriter` é compatível com `JAXB_FORMATTED_OUTPUT`. Comportamentos questionáveis do original — o bug do diferimento (o tributo devido deriva do calculado, não da expressão própria) e a base negativa zerada em silêncio — são **reproduzidos fielmente** e marcados no código com `// PARITY:`.

5. **Paridade demonstrada, não presumida.** Os *golden tests* carregam os fixtures oficiais de entrada e os gabaritos de saída do repositório Java e comparam campo a campo — incluindo o teste de regressão com **262 objetos** e os cenários de compra governamental (União, Estado, Município), excluindo apenas `memoriaCalculo`/`calculoSimulado`, exatamente como o teste original exclui. Os XMLs gerados são todos validados contra os `grupo.xsd` oficiais nos testes.

---

## Tecnologias

| Camada | Original (Java) | Este porte (TypeScript) |
|---|---|---|
| Linguagem/Runtime | Java 21 | TypeScript 5.9 · Node.js 22 |
| API | Spring Boot 3.5 | [NestJS 11](https://nestjs.com/) |
| Documentação | springdoc-openapi | [@nestjs/swagger](https://docs.nestjs.com/openapi/introduction) |
| Aritmética decimal | `java.math.BigDecimal` | [decimal.js](https://mikemcl.github.io/decimal.js/) (via emulação `JBD` com escala) |
| Expressões de cálculo | Apache Commons JEXL 3 | Parser aritmético próprio (sandbox por construção) |
| Banco de dados | SQLite (xerial) + Flyway | SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) + runner de migrações TS |
| Geração/validação XML | JAXB + XSD | `XmlWriter` JAXB-compatível + [xmllint](http://xmlsoft.org/xmllint.html) (libxml2) + os mesmos XSDs SEFAZ |
| Cache | Caffeine (~50 caches) | LRU+TTL equivalente |
| Frontend | — | [React 19](https://react.dev/) + [Vite 7](https://vite.dev/) |
| Testes | JUnit 5 + JaCoCo | [Vitest](https://vitest.dev/) (42 unitários/golden + 14 e2e) |
| Distribuição | JAR + banco | Docker (3 estágios) / pnpm |

---

## Requisitos

### Requisitos do Sistema

- **Node.js**: versão 22 ou superior
- **pnpm**: 10+ (habilite com `corepack enable`; o Node já vem com Corepack)
- **xmllint** (libxml2): apenas para o endpoint de validação de XML (presente por padrão no macOS; no Linux, `apt install libxml2-utils`)
- **Java**: **não é necessário** — o banco é gerado pelo runner TypeScript a partir dos mesmos scripts SQL oficiais
- **Sistema Operacional**: Windows, macOS ou Linux

### Dependências Principais

- **NestJS 11**: framework da aplicação web
- **better-sqlite3**: acesso síncrono ao SQLite somente-leitura
- **decimal.js**: base da aritmética `BigDecimal`
- **Vite 7 + React 19**: playground web
- **Vitest**: suíte de testes (unitários, paridade e e2e)

---

## Instruções de Instalação

### 1. Clonar o Repositório

```bash
git clone https://github.com/Filip3Dev/calculadora-rtc-regime-regular-ts.git
cd calculadora-rtc-regime-regular-ts
```

### 2. Instalar Dependências

```bash
corepack enable
pnpm install
```

### 3. Gerar o Banco de Dados (obrigatório)

O motor lê `db/calculadora.db`, aberto em modo somente-leitura. O banco é gerado a partir dos scripts SQL oficiais do projeto original (copiados em `db/sql`):

```bash
pnpm db:build
```

Confirme que o arquivo foi criado: `ls -lah db/calculadora.db` (~5 MB, 54 tabelas).

> **Atenção:** a API só funciona com o banco gerado.

### 4. Executar os Testes

Os testes de paridade usam os fixtures do repositório Java original; aponte `JAVA_FIXTURES` para um clone local (sem ela, os golden tests pulam):

```bash
git clone https://github.com/ReceitaFederal/calculadora-rtc-regime-regular /tmp/calculadora-java
JAVA_FIXTURES=/tmp/calculadora-java/src/test/resources pnpm --filter @rtc/core test
```

### 5. Executar a API

```bash
pnpm dev:api          # desenvolvimento (tsx watch)
# ou
pnpm build && node apps/api/dist/main.js
```

A API estará disponível em `http://localhost:8080/api` e o Swagger em `http://localhost:8080/api/swagger`.

### 6. Executar o Playground

Com a API de pé, em outro terminal:

```bash
pnpm dev:web
```

O playground estará disponível em `http://localhost:5173`: exemplos prontos, modos fail-fast e observabilidade, totais, cartões por tributo com memória de cálculo e visualização dos erros `REG`/`CAL` por item.

### 7. Docker (alternativa)

```bash
docker build -t calculadora-rtc-regime-regular-ts .
docker run -p 8080:8080 calculadora-rtc-regime-regular-ts
```

A imagem gera o banco em build, compila API/core e entrega o runtime com `xmllint` instalado.

### 8. Deploy (Cloudflare Containers + Workers)

Publica API + playground numa URL única (`https://calculadora-rtc.<seu-subdominio>.workers.dev`): o Worker de borda (`deploy/edge/`) serve o playground como Static Assets e proxya `/api/*` para a API rodando num [Cloudflare Container](https://developers.cloudflare.com/containers/) gerenciado por um Durable Object (start/stop, sonda de prontidão em `/api/calculadora/versao`, sleep por inatividade). O `Dockerfile` da raiz é a imagem do container — os `FROM` já são pinados em `linux/amd64`.

> **Demo público**: https://rtc.bitpag.xyz (também em https://calculadora-rtc.bitpag.workers.dev)
>
> O `routes` em `deploy/edge/wrangler.jsonc` aponta para o domínio do autor — remova ou ajuste para uma zone da sua conta antes de publicar.

Pré-requisitos: conta Cloudflare com plano Workers Paid, [Docker](https://www.docker.com/products/docker-desktop/) rodando (o wrangler builda a imagem localmente) e login:

```bash
cd deploy/edge && pnpm install && npx wrangler login && cd ../..
```

Publicar (builda o playground, a imagem do container e o Worker):

```bash
pnpm deploy:cloudflare
```

Comportamento: o container dorme após 10 min sem tráfego; a primeira chamada seguinte paga o boot (alguns segundos). A cobrança é por tempo de execução do container (frações de 10 ms) — ver [preços](https://developers.cloudflare.com/containers/platform/pricing/).

---

## Exemplo de Utilização

```bash
curl -X POST http://localhost:8080/api/calculadora/regime-geral \
  -H 'content-type: application/json' \
  -d '{
    "id": "demo", "versao": "0.0.1",
    "dhFatoGerador": "2026-06-01T09:50:05-03:00",
    "municipio": 4314902, "uf": "RS",
    "itens": [{ "numero": 1, "ncm": "09024000", "cst": "000", "cClassTrib": "000001",
                "baseCalculo": 200, "quantidade": 1, "unidade": "UN" }]
  }'
```

Resposta (alíquotas de referência 2026: CBS 0,9% · IBS-UF 0,1% · IBS-Município 0,0%):

```json
{
  "objetos": [{
    "nObj": 1,
    "tribCalc": { "IBSCBS": { "CST": "000", "cClassTrib": "000001", "gIBSCBS": {
      "vBC": "200.00",
      "gIBSUF": { "pIBSUF": "0.10", "vIBSUF": "0.20", "memoriaCalculo": "…" },
      "gIBSMun": { "pIBSMun": "0.00", "vIBSMun": "0.00", "memoriaCalculo": "…" },
      "vIBS": "0.20",
      "gCBS": { "pCBS": "0.90", "vCBS": "1.80", "memoriaCalculo": "…" }
    }}},
    "calculoSimulado": false
  }],
  "total": { "tribCalc": { "IBSCBSTot": { "vBCIBSCBS": "200.00" } } }
}
```

E o XML do grupo RTC correspondente, com o ROC acima como corpo (`roc.json`):

```bash
curl -X POST "http://localhost:8080/api/calculadora/xml/generate?tipo=nfe" \
  -H 'content-type: application/json' --data @roc.json
```

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<infNFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <det nItem="1">
    <imposto>
      <IBSCBS>
        <CST>000</CST>
        <cClassTrib>000001</cClassTrib>
        <gIBSCBS>
          <vBC>200.00</vBC>
          ...
```

---

## Estado do Porte

| Funcionalidade | Status |
|---|---|
| Motor CBS/IBS/IS (expressões do banco, monofasia, desoneração/suspensão, diferimento, compra governamental 2027+, base unificada 2026–2033) | ✅ paridade golden |
| Observabilidade (estado por item, catálogo REG/CAL, ProblemDetail RFC 9457) | ✅ |
| NFS-e (base legada, bases unificadas MEI/locação/salão, indicadores de operação, locais) | ✅ |
| Pedágio (CBS/IBS por praça, proporcional à extensão) | ✅ |
| Dados abertos (UFs, municípios, cClassTrib por CST, CST, NCM/NBS, alíquotas de referência, fundamentações, redutores, transferências, unidades) | ✅ |
| Validação XML contra XSDs SEFAZ (8 tipos, anti-XXE) | ✅ |
| Geração do XML do grupo RTC a partir do ROC (7 tipos geráveis; NFS-e é validação-only, como no original) | ✅ valida contra os `grupo.xsd` oficiais |
| Crédito presumido, transferência de crédito, ajuste de competência e estorno (grupos `gCredPres*`, `gTransfCred`, `gAjusteCompet`, `gEstornoCred`) | ⛔ *stubs* nulos — como no próprio original (previstos no roadmap oficial) |

---

## Créditos e Atribuições

Este projeto só é possível porque o seguinte material é público e aberto:

- **[ReceitaFederal/calculadora-rtc-regime-regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular)** — a Calculadora de Tributos oficial da Reforma Tributária do Consumo, mantida pela **[Secretaria Especial da Receita Federal do Brasil](https://www.gov.br/receitafederal)** com desenvolvimento do **[SERPRO](https://www.serpro.gov.br)** (licença MIT). Todo o acervo tributário usado aqui — scripts SQL/migrações, leiautes XSD da SEFAZ, tabela de códigos de erro, expressões de cálculo e suítes de teste — provém desse repositório e é aqui utilizado nos termos da licença MIT, com atribuição.
- **[Lei Complementar nº 214, de 16 de outubro de 2025](https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm)** — a reforma tributária do consumo que este motor implementa (art. 349, § 14, para a regra de arredondamento).
- **[Apache Commons JEXL](https://commons.apache.org/proper/commons-jexl/)** — inspiração da semântica do avaliador de expressões (ADR001 do projeto original).
- **[decimal.js](https://mikemcl.github.io/decimal.js/)** (MIT), **[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)** (MIT), **[NestJS](https://nestjs.com/)** (MIT), **[React](https://react.dev/)** e **[Vite](https://vite.dev/)** (MIT), **[Vitest](https://vitest.dev/)** (MIT), **[libxml2/xmllint](http://xmlsoft.org/)** (MIT) — as fundações deste porte.

Estrutura de pacotes inspirada na organização do projeto original (`api` → `domain` → `core`).

---

## Referências

- [Code of conduct](https://www.contributor-covenant.org)
- [MIT license](https://choosealicense.com/licenses/mit/)
- [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
- [Semantic Versioning](https://semver.org/lang/pt-BR/)

## Licença

Este projeto é distribuído sob a licença [MIT](LICENSE), incluindo atribuição aos componentes originais da Receita Federal do Brasil e do SERPRO.
