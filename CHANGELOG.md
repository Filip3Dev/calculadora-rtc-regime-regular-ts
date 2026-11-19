# Changelog

Notáveis mudanças deste projeto serão documentadas aqui. O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o versionamento [SemVer](https://semver.org/lang/pt-BR/).

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
