# Design — Paridade total: geração XML, NFS-e, pedágio e dados abertos

**Data**: 2026-11-19 · **Status**: ✅ implementado (v0.2.0–v0.3.0) · **Escopo**: fases 1–3 abaixo

## Objetivo

Completar a paridade de escopo com a API oficial
(ReceitaFederal/calculadora-rtc-regime-regular v1.6.1): geração de XML
(ROC → DF-e), serviços NFS-e, pedágio e os endpoints de dados abertos
restantes.

## Descoberta-chave

A geração XML consome o **próprio ROC** (saída do `/regime-geral`). O XML
gerado é o elemento `infNFe` parcial do **grupo RTC** (`ide.gCompraGov?` +
`det[].imposto{IS?, IBSCBS}` + `total{ISTot?, IBSCBSTot?}`), conforme o
`grupo.xsd` de cada tipo — não a nota completa. Os serviços `*XmlService`
somam ~870 linhas; os modelos JAXB ~7,6 mil linhas (majoritariamente
anotações). NFS-e é validação-only no original (`geracao=false`).

## Fase 1 — Quick wins

- **NFS-e**: porte de `NfseService` (base de cálculo NFS-e, formatação
  `cTribNac`, indicador de operação) + `BaseCalculoUnificadaNfseService`
  (MEI, locação com copropriedade, parceiro/salão, documentos de ajuste
  E1302/E1534/E0436) + 6 endpoints do `NfseController`.
- **Pedágio**: `PedagioService` (CBS/IBS por praça, proporcional à extensão)
  + endpoint `POST /calculadora/pedagio`.
- **Dados abertos**: ~20 endpoints restantes (anexos por cClassTrib, redutores
  compra gov, transferências CBS, fundamentação detalhada etc.).
- **Testes**: unitários por serviço + e2e; fixtures NFS-e do repo Java como
  golden quando aplicável.

## Fase 2 — Motor XML comum + NF-e

Em `packages/core/src/xml/`:

1. `XmlWriter` (~100 linhas): namespace default, indentação 2 espaços,
   header compatível com JAXB (`standalone="yes"`), escape de entidades.
2. Tipos comuns RTC (de `DFeTiposBasicos_v1.00.xsd`): `TIS`, `TTribNFe`
   (gIBSCBS/gIBSCBSMono/gDif/gRed/gTribRegular/gTribCompraGov), `TISTot`,
   `TIBSCBSMonoTot`, `TCompraGov` — writers tipados reutilizando os
   formatadores TDec existentes (`formatarMoeda/Aliquota/Quantidade`).
3. Modelo `InfNFe` + mapper ROC→XML: porte fiel do `NfeXmlService`
   (conversores tpEnteGov→código, pRedutor→formatarAliquota).
4. Endpoint `POST /xml/generate?tipo=nfe` (produces application/xml) +
   `GET /xml/generate`.
5. Paridade: (a) todo XML gerado auto-validado contra `grupo.xsd` via
   xmllint no teste; (b) asserts campo-a-campo TDec contra o ROC de origem.

## Fase 3 — Demais 7 tipos de DF-e

Molde da NF-e, um a um: NFC-e, CT-e, CT-e Simplificado, BP-e, BP-e TM,
NF3-e — modelo JAXB→TS (500–1.300 linhas Java cada) + `*XmlService` +
teste de validação. Tipos comuns da Fase 2 reutilizados. NFS-e permanece
validação-only (paridade com o original).

## Decisões de paridade

- Saída JAXB_FORMATTED_OUTPUT: indentação 2 espaços, header
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`.
- Formatos TDec e ordem de elementos idênticos aos modelos JAXB.
- Erros de geração: `IllegalArgumentException` do original → 400
  (CampoInvalido/REG-024).

## Riscos

- Ordem de elementos fixa por anotações JAXB → garantida por construção
  nos writers tipados.
- ModelMapper mapeia por nome de campo → porte manual campo a campo.
- `grupo.xsd` inclui os XSDs originais SEFAZ → auto-validação cobre a
  conformidade estrutural completa.
