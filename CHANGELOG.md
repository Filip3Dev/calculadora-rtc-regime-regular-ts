# Changelog

Notáveis mudanças deste projeto serão documentadas aqui. O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [0.4.3] — 2026-11-19

### Adicionado

- **Pacote npm `calculadora-rtc-core`**: o core publicado com banco SQLite pré-gerado embutido (prepack, 5,5 MB → tarball 1,4 MB) + **CLI `calculadora-rtc`** (`calc` regime-geral, `obs` observabilidade, `xml` geração dos 7 DF-e, `versao`), testado com fixtures oficiais.

## [0.4.2] — 2026-11-19

### Adicionado

- **Upstream tracking**: workflow diário (09:00 BRT) vigia o repositório oficial
  (tags/commits/migrações Flyway) — movimento abre issue automática (label `upstream`)
  com diff e passos de sincronização; migrações novas geram **PR automático** com os
  SQLs para o CI validar. Probe do piloto oficial reporta dados da nuvem ainda não
  publicados (hoje: V0073 vs V0059 público).

## [0.4.1] — 2026-11-19

### Adicionado

- **CI (GitHub Actions)**: a cada push/PR — checkout dos fixtures de paridade do
  repositório Java oficial (sparse-checkout de `src/test/resources` → `JAVA_FIXTURES`),
  `libxml2-utils` para a validação XSD dos XMLs, `pnpm db:build` + build + typecheck e os
  **66 testes com a API de pé** (49 do core — incluindo os golden de paridade, que rodam
  contra os gabaritos oficiais — e 17 e2e HTTP), com teardown e log da API em falha.
  Badge de status no README.

## [0.4.0] — 2026-11-19

### Adicionado

- **Teste diferencial ao vivo** (`scripts/diferencial.mts`): dispara os fixtures
  oficiais contra a API Java (Docker, porta 8081) e a TS (8080) e compara —
  **83/83 idênticos**: regime-geral e observabilidade campo a campo (incluindo
  memoriaCalculo), 25 casos de erro (status + detail) e XML dos 7 tipos de DF-e
  **byte a byte**. Encontrou e corrigiu 5 divergências reais:
  - Indentação do XML: JAXB usa **4 espaços** (não 2) e termina com quebra de linha
  - Hierarquia de status HTTP portada fielmente: família "não encontrada" → **404**,
    CampoInvalido (inclui DataFatoGerador) → **400**, ErroFaltaImplementacao → **422**
  - Bean Validation pré-cálculo no fail-fast: 400 com o formato exato do original
    ("Um ou mais campos são inválidos - [itens[0].cClassTrib: size must be between 6 and 6]")
  - DataFatoGeradorNaoInformada lançava erro genérico 500 em vez de REG-021/400
- **Playground — Assistente**: formulário guiado com autocompletes alimentados pelos
  dados abertos (NCM/NBS por código **ou descrição**, cClassTrib, CST, UFs e
  municípios), suporte a compra governamental, Imposto Seletivo, alíquotas
  nominais e desoneração; conversão bidirecional com o modo JSON
- **Playground — aba XML**: gera o XML do grupo RTC do resultado calculado para
  qualquer um dos 7 tipos de DF-e, valida contra o XSD oficial e copia
- **Dados abertos**: NCM/NBS aceitam `q=` (busca textual por descrição) além de `prefixo`
- **Deploy**: `INSTANCE_NAME` versionado no Worker — instâncias de container persistem entre
  deploys (mesmo após `wrangler containers delete`); o bump do nome força container novo com
  a imagem atual na hora

## [0.3.0] — 2026-11-19

### Adicionado

- **Paridade de endpoints 100% com a API oficial**:
  - `POST /base-calculo/is-mercadorias` e `POST /base-calculo/cbs-ibs-mercadorias`
    (porte fiel do BaseCalculoService: composição integra/não-integra com as
    mesmas mensagens de erro por vigência)
  - Dados abertos: `ncm/vigentes`, `nbs/lista`, `nbs-aplicaveis`,
    `aliquota-uniao|uf|municipio`, `transferencias-ibs` (tabela fixa do original),
    `dfe/grupos`, `ator/grupos`, `classificacoes-tributarias/nbs`,
    detalhe por `class-trib/{cClassTrib}` (com tipos de DF-e vinculados) e
    `ncm-aplicavel` (vínculo por prefixo)
  - `GET /calculadora/download/url` (por plataforma, 204 sem configuração) e
    `GET /versao/status` (local × remota)
- **Golden tests de observabilidade**: os 6 cenários oficiais de compra
  governamental (`*_output_observabilidade.json`) agora comparam estado do item,
  tributos e totais campo a campo — inclusive um cenário com erro REG-002.
- **[docs/exemplos.md](docs/exemplos.md)**: exemplos completos de utilização com
  entradas e saídas REAIS capturadas desta API (observabilidade 1:1 com o
  exemplo oficial, base unificada 870/840/1060 idem), incluindo pedágio e NFS-e;
  linkado no README, como no projeto original.
- **Swagger enriquecido**: `@ApiBody` com exemplo válido e respostas 200/422
  (ProblemDetail com código/campo/estadoItem) nos principais POSTs — antes os
  corpos não eram documentados (controllers aceitam JSON flexível). Versão do
  documento lida do package.json.

### Corrigido

- **Bug de paridade no rateio da compra governamental** (achado pelo golden de
  observabilidade): Consórcio Público e Comitê Gestor do IBS equivalem a
  MUNICÍPIO e Distrito Federal a ESTADO no `tipoEnteEquivalente()` do original —
  o porte comparava os códigos crus e zerava o IBS-Mun nesses casos.
- Serializador de observabilidade omitindo chaves `undefined` (NON_NULL), alinhado ao regime-geral.
- Endpoints de classificação por CST: valor via path param (antes lido como query, retornando vazio).
- **Deploy**: `/api/*` em navegações caíam no fallback SPA do Static Assets antes
  do Worker (`/api/swagger` abria o playground no navegador); fix com
  `run_worker_first: ["/api/*"]` no wrangler.jsonc.
- **Base unificada**: componentes agora aceitos ACHATADOS no nível raiz
  (`@JsonUnwrapped` do original; aninhado segue valendo) e `natureza` aceita
  `bem`/`servico` em qualquer caixa — com isso o exemplo oficial retorna
  exatamente 870/840/1060.

## [0.2.1] — 2026-11-19

### Adicionado

- **Deploy Cloudflare** (`pnpm deploy:cloudflare`, domínio próprio **rtc.bitpag.xyz** via
  Custom Domain no `wrangler.jsonc`): Worker de borda em `deploy/edge/` que serve o
  playground como Static Assets e proxya `/api/*` para a API em um
  [Cloudflare Container](https://developers.cloudflare.com/containers/) gerenciado por
  Durable Object (sonda de prontidão em `/api/calculadora/versao`, sleep após 10 min de
  inatividade, `instance: lite`, sem internet de saída). URL única em
  `https://calculadora-rtc.<subdominio>.workers.dev`.

### Corrigido

- **Dockerfile buildava com falha**: faltavam `COPY` de `apps/api/node_modules` e
  `packages/core/node_modules` (resolução do linker isolado do pnpm), o estágio db usava
  `--ignore-scripts` (impedia o binding nativo do better-sqlite3) e o estágio build não
  copiava `apps/playground/package.json`. Pnpm pinado em `packageManager` (o corepack da
  imagem entregava pnpm 12 ≠ host 10) e allowlist `onlyBuiltDependencies` movida para
  `pnpm-workspace.yaml`; `FROM` pinados em `linux/amd64` (exigência do Containers);
  criado `.dockerignore`.
- Worker de borda: corrida `start()` × hibernação do Durable Object ("start() cannot be
  called on a container that is already running", erro 1101 após o DO acordar) — o start
  agora é guardado por `running` + tolerante à corrida, com flag `ready` para não re-sondar
  requests quentes. Script renomeado para `deploy:cloudflare` (`pnpm deploy` é comando
  nativo do pnpm e captura o comando antes do script).

## [0.2.0] — 2026-11-19

### Adicionado

- **Geração de XML do grupo RTC a partir do ROC** para 7 tipos de DF-e: NF-e, NFC-e,
  CT-e, CT-e Simplificado, BP-e, BP-e TM e NF3-e (`POST /api/calculadora/xml/generate?tipo=`).
  Todo XML gerado é validado nos testes contra os `grupo.xsd` oficiais da SEFAZ
  (xmlWriter compatível com a saída JAXB: header `standalone="yes"`, indentação 2,
  ordem dos elementos conforme os `propOrder` dos modelos do original).
- **NFS-e**: base de cálculo legada (`POST /nfse/base-calculo`), bases unificadas
  RG/SN com MEI, locação 99.03, salão/profissional parceiro e documentos de ajuste
  (códigos E1302, E1534, E0436, LEIAUTE-XTP), indicadores de operação (validação de
  combinação NBS+cClassTrib+cIndOp, locais de fornecimento/incidência, situações
  por NBS) e catálogos de locais (28 fornecimento, 7 incidência).
- **Pedágio**: `POST /calculadora/pedagio` — CBS/IBS por praça, alíquota efetiva
  proporcional à extensão do trecho; header `x-warning-dados-simulados` a partir de 2027.
- **Dados abertos**: classificações tributárias por CST (CBS/IBS e Imposto Seletivo),
  redutores de compra governamental, transferências de CBS e unidades de medida.
- Testes: 12 unitários de NFS-e + geração XML parametrizada nos 7 tipos (xmllint)
  + 6 e2e novos — **42 testes core + 14 e2e**.

## [0.1.0] — 2026-11-19

- Versão inicial: motor de cálculo CBS/IBS/Imposto Seletivo com paridade estrita
  (golden tests com os fixtures oficiais do projeto Java, incluindo a regressão de
  262 objetos), API NestJS (regime-geral, observabilidade, dados abertos, base
  unificada, validação XSD), playground React e Docker.
