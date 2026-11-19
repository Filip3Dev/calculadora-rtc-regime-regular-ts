# Changelog

Notáveis mudanças deste projeto serão documentadas aqui. O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [Não publicado]

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
