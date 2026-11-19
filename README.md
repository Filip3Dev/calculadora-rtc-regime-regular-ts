# Calculadora de Tributos RTC — TypeScript

## Descrição do Projeto

Porte em **TypeScript** da [Calculadora de Tributos da Reforma Tributária do Consumo](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular), a API oficial da Receita Federal que realiza o cálculo da **CBS**, do **IBS** e do **Imposto Seletivo** (LC 214/2025) nas operações do regime regular.

Este projeto reproduz o motor de cálculo oficial com **paridade estrita de saída**: os mesmos valores, os mesmos grupos de tributação, a mesma memória de cálculo (caractere a caractere) e o mesmo catálogo de erros `REG`/`CAL` — verificado por *golden tests* que executam as próprias suítes de teste do projeto original contra este motor.

Além da API REST, inclui um **playground web** para montar operações e visualizar o cálculo com a memória de cada tributo.

> **Aviso:** projeto independente, de código aberto, **não oficial**. As alíquotas de 2026 disponíveis na base são valores de referência (ainda não definidos em lei) — a calculadora oficial as trata como dados de simulação, e este porte reproduz esse comportamento.

---

## Público-Alvo

- Empresas de tecnologia que precisam embutir o cálculo RTC em stacks Node.js/TypeScript
- Desenvolvedores que estudam a Reforma Tributária do Consumo e sua implementação de referência
- Contribuintes em geral que desejam simular operações do regime regular

---

## Funcionalidades

Todos os caminhos começam com `http://localhost:8080/api/calculadora`. A lista completa está no Swagger (`http://localhost:8080/api/swagger`).

| Funcionalidade | Endpoint |
|---|---|
| Cálculo de tributos (a operação inteira falha no primeiro erro) | `POST /regime-geral` |
| Cálculo com observabilidade (erros por item, sem interromper os demais) | `POST /observabilidade/regime-geral` |
| Descrição de um código de erro da observabilidade | `GET /observabilidade/erros?codigo=REG-011` |
| Base de cálculo unificada (NF-e/NFC-e, transição 2026–2033) | `POST /base-calculo/base-calculo-unificada` |
| Validação de XML (grupo ou nota) contra o XSD oficial (NF-e, NFC-e, NFS-e, CT-e, CT-e Simplificado, BP-e, BP-e TM, NF3-e) | `POST /xml/validate?tipo=nfe&subtipo=grupo` |
| CST e classificações tributárias (cClassTrib) | `GET /dados-abertos/situacoes-tributarias/cbs-ibs`, `GET /dados-abertos/classificacoes-tributarias` |
| Fundamentações legais | `GET /dados-abertos/fundamentacoes-legais` |
| NCM e NBS (consulta por prefixo, paginada) | `GET /dados-abertos/ncm`, `GET /dados-abertos/nbs` |
| Alíquotas de referência (CBS, IBS-UF, IBS-Município) | `GET /dados-abertos/aliquota-referencia` |
| UFs, municípios e tipos de documento fiscal | `GET /dados-abertos/ufs`, `/municipios`, `/tipos-documento` |
| Versão da base de dados embutida | `GET /versao` |

---

## Como este porte foi feito

O ponto de partida foi a leitura sistemática do código-fonte Java do projeto original (Spring Boot 3, Java 21) e dos seus [10 ADRs](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular/tree/main/docs/adr). As decisões arquiteturais do original foram preservadas:

1. **O banco de dados é o mesmo.** Os scripts SQL oficiais (baseline `B0001` + 58 migrações de manutenção do [Flyway](https://flywaydb.org/)) são executados por um *runner* TypeScript (`packages/core/scripts/build-db.ts`) que replica a ordem, o padrão transacional (`PRAGMA defer_foreign_keys`) e os *callbacks* do build original — sem exigir Java. O resultado é o mesmo SQLite somente-leitura com 54 tabelas: classificações tributárias, **expressões de cálculo**, alíquotas, NCM/NBS, municípios etc.

2. **O cálculo continua dirigido por expressões (ADR001).** As fórmulas fiscais vivem na tabela `TRATAMENTO_TRIBUTARIO` como texto (ex.: `baseCalculoInformada-impostoSeletivoInformado+impostoSeletivoCalculado`) e são avaliadas em runtime por um parser aritmético próprio (~150 linhas) com as mesmas semânticas do Apache JEXL usado no original: variáveis não informadas valem zero, atalho para expressão de variável única, e *sandbox por construção* (a gramática só aceita identificadores, literais, `+ - * /` e parênteses — não existe sintaxe para chamar funções ou acessar propriedades).

3. **A aritmética é idêntica à do Java.** A classe `JBD` (`packages/core/src/model/jbd.ts`) emula `java.math.BigDecimal` **incluindo a escala**, que se propaga pelas operações e vaza para a memória de cálculo (ex.: `"R$ 200.00000000"`, `"0.900000%"`): 8 casas internas com `HALF_EVEN` (art. 349, § 14, da LC 214/2025, como no ADR003 do original) e divisões com `MathContext.DECIMAL128` (34 dígitos), sobre [decimal.js](https://mikemcl.github.io/decimal.js/).

4. **Porte fiel dos serviços.** A cadeia `CalculadoraService → ProcessamentoItemService → CalculoTributoService → CalculoCbsIbsService/CalculoImpostoSeletivoService` foi portada método a método, com os SQLs nativos dos repositórios JPA copiados para *prepared statements* (incluindo o vínculo NCM↔cClassTrib por **prefixo** e a lógica de exceções dos anexos). Comportamentos questionáveis do original — o bug do diferimento (o tributo devido deriva do calculado, não da expressão própria) e a base negativa zerada em silêncio — são **reproduzidos fielmente** e marcados no código com `// PARITY:`, conforme a decisão de paridade estrita.

5. **Paridade demonstrada, não presumida.** Os *golden tests* (`packages/core/test/paridade.golden.test.ts`) carregam os fixtures oficiais de entrada e os gabaritos de saída do repositório Java e comparam campo a campo — incluindo o teste de regressão com **262 objetos** e os cenários de compra governamental (União, Estado, Município), excluindo apenas `memoriaCalculo`/`calculoSimulado`, exatamente como o teste original exclui.

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
| Validação XML | JAXB + XSD | [xmllint](http://xmlsoft.org/xmllint.html) (libxml2) + os mesmos XSDs SEFAZ |
| Cache | Caffeine (~50 caches) | LRU+TTL equivalente |
| Frontend | — | [React 19](https://react.dev/) + [Vite 7](https://vite.dev/) |
| Testes | JUnit 5 + JaCoCo | [Vitest](https://vitest.dev/) (unitários + golden + e2e) |
| Distribuição | JAR + banco | Docker (3 estágios) / pnpm |

---

## Requisitos

### Requisitos do Sistema

- **Node.js**: versão 22 ou superior
- **pnpm**: 10+ (habilita com `corepack enable`; o Node já vem com Corepack)
- **xmllint** (libxml2): apenas para o endpoint de validação de XML (presente por padrão no macOS; no Linux, `apt install libxml2-utils`)
- **Java**: **não é necessário** — o banco é gerado por runner TypeScript a partir dos mesmos scripts SQL oficiais
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
git clone https://github.com/Filip3Dev/calculadora-rtc-ts.git
cd calculadora-rtc-ts
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

Os testes de paridade usam os fixtures do repositório Java original; aponte a variável `JAVA_FIXTURES` para um clone local (sem ela, os golden tests pulam):

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

O playground estará disponível em `http://localhost:5173` (com exemplos prontos, modo fail-fast/observabilidade e memória de cálculo por tributo).

### 7. Docker (alternativa)

```bash
docker build -t calculadora-rtc-ts .
docker run -p 8080:8080 calculadora-rtc-ts
```

A imagem gera o banco em build, compila API/core e entrega o runtime com `xmllint` instalado.

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

---

## Estado do Porte

| Funcionalidade | Status |
|---|---|
| Motor CBS/IBS/IS (expressões do banco, monofasia, desoneração/suspensão, diferimento, compra governamental 2027+, base unificada 2026–2033) | ✅ paridade golden |
| Observabilidade (estado por item, catálogo REG/CAL, ProblemDetail RFC 9457) | ✅ |
| Dados abertos essenciais (UFs, municípios, cClassTrib, CST, NCM/NBS, alíquotas de referência, fundamentações) | ✅ |
| Validação XML contra XSDs SEFAZ (8 tipos, anti-XXE) | ✅ |
| Geração de XML (ROC → DF-e) | ⛔ não portada nesta versão (leiautes JAXB extensos) |
| NFS-e (algoritmo próprio) e pedágio | ⛔ não portados nesta versão |

---

## Créditos e Atribuições

Este projeto só é possível porque o seguinte material é público e aberto:

- **[ReceitaFederal/calculadora-rtc-regime-regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular)** — a Calculadora de Tributos oficial da Reforma Tributária do Consumo, mantida pela **[Secretaria Especial da Receita Federal do Brasil](https://www.gov.br/receitafederal)** com desenvolvimento do **[SERPRO](https://www.serpro.gov.br)** (licença MIT). Todo o acervo tributário usado aqui — scripts SQL/migrações, leiautes XSD da SEFAZ, tabela de códigos de erro e suítes de teste — provém desse repositório e é aqui utilizado nos termos da licença MIT, com atribuição.
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
