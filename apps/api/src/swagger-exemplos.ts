/**
 * Exemplos reais (capturados da própria API) usados na documentação Swagger
 * via @ApiBody/@ApiResponse — os controllers aceitam JSON flexível, então os
 * exemplos documentam o contrato na prática.
 */

export const PROBLEM_DETAIL_422 = {
  type: "/api/calculadora/observabilidade/erros?codigo=REG-002",
  title: "NCM não encontrada",
  status: 422,
  detail: "NCM de código 00000000 não encontrada para a data 2026-06-01",
  instance: "/api/calculadora/regime-geral",
  codigo: "REG-002",
  campo: "ncm",
  estadoItem: "INCONSISTENCIA_ENTRADA",
  timestamp: "2026-11-19T13:00:00.000Z",
};

export const OPERACAO_SIMPLES = {
  id: "6194602ea71cbf9431c236de4409d920",
  versao: "0.0.1",
  dhFatoGerador: "2026-06-01T09:50:05-03:00",
  municipio: 4314902,
  uf: "RS",
  itens: [
    {
      numero: 1,
      ncm: "09024000",
      cst: "000",
      cClassTrib: "000001",
      baseCalculo: 200,
      quantidade: 1,
      unidade: "UN",
    },
  ],
};

export const OPERACAO_OBSERVABILIDADE = {
  id: "6194602ea71cbf9431c236de4409d920",
  versao: "1.0.0",
  dhFatoGerador: "2027-03-10T10:00:00-03:00",
  municipio: 4314902,
  uf: "RS",
  itens: [
    { numero: 1, ncm: "10063021", cst: "200", cClassTrib: "200003", baseCalculo: 100.0, quantidade: 20, unidade: "KG", aliquotasNominais: { cbs: 8.8, ibsEstadual: 0.05, ibsMunicipal: 0.05 } },
    {
      numero: 2, ncm: "22030000", cst: "000", cClassTrib: "000001", quantidade: 12, unidade: "LT",
      impostoSeletivo: { cst: "000", cClassTrib: "000001", baseCalculo: 150.0, quantidade: 12, unidade: "LT", impostoInformado: 15.0 },
      aliquotasNominais: { cbs: 8.8, ibsEstadual: 0.05, ibsMunicipal: 0.05, impostoSeletivo: { adValorem: 10.0 } },
    },
    { numero: 3, nbs: "122011200", cst: "200", cClassTrib: "200028", baseCalculo: 1200.0, aliquotasNominais: { cbs: 8.8, ibsEstadual: 0.05, ibsMunicipal: 0.05 } },
    { numero: 4, ncm: "02013000", cst: "200", cClassTrib: "200035", baseCalculo: 80.0, aliquotasNominais: { cbs: 8.8, ibsEstadual: 0.05, ibsMunicipal: 0.05 } },
  ],
};

export const BASE_UNIFICADA = {
  anoFatoGerador: 2027,
  tipoDocumento: 55,
  natureza: "bem",
  vProd: 1000.0,
  vFrete: 50.0,
  vSeg: 20.0,
  vOutro: 10.0,
  vDesc: 50.0,
  vIS: 30.0,
  vPIS: 9.25,
  vCOFINS: 46.25,
  vICMS: 180.0,
  vFCP: 10.0,
};

export const BASE_IS_MERCADORIAS = {
  anoFatoGerador: 2027,
  valorBem: 1000.0,
  freteCobrado: 100.0,
  icms: 50.0,
  descontoIncondicional: 30.0,
};

export const BASE_CIBS_MERCADORIAS = {
  anoFatoGerador: 2026,
  valorBem: 1000.0,
  frete: 100.0,
  impostoSeletivo: 200.0,
  pis: 10.0,
  cofins: 20.0,
  icms: 50.0,
};

export const BASE_UNIFICADA_NFSE = {
  anoFatoGerador: 2026,
  opSimpNac: 1,
  situacao: "comum",
  vServ: 1000,
  vDescIncond: 100,
  vISSQN: 50,
  vPIS: 10,
  vCOFINS: 20,
};

export const NFSE_BASE_CALCULO = {
  anoFatoGerador: 2026,
  valorServico: 1000,
  descontoIncondicional: 50,
  pis: 10,
  cofins: 20,
  iss: 30,
};

export const PEDAGIO = {
  dataHoraEmissao: "2026-06-01T08:00:00-03:00",
  codigoMunicipioOrigem: 4314902,
  ufMunicipioOrigem: "RS",
  cst: "000",
  cClassTrib: "000001",
  baseCalculo: 100,
  extensaoTotal: 100,
  trechos: [
    { numero: 1, municipio: 4314902, uf: "RS", extensao: 60 },
    { numero: 2, municipio: 4205407, uf: "SC", extensao: 40 },
  ],
};

/** ROC (resposta de POST /regime-geral) — corpo de /xml/generate. */
export const ROC_EXEMPLO = OPERACAO_SIMPLES; // documentado: enviar a RESPOSTA do cálculo

/** Importa os decorators uma única vez. */
import { ApiBody, ApiOkResponse, ApiResponse } from "@nestjs/swagger";

const APP_JSON = "application/json";

export function BodyExemplo(descricao: string, exemplo: unknown) {
  return ApiBody({
    description: descricao,
    required: true,
    schema: { type: "object", additionalProperties: true },
    examples: { exemplo: { summary: "Exemplo válido", value: exemplo } },
  });
}

export function BodyTextoXml(descricao: string, exemplo: string) {
  return ApiBody({
    description: descricao,
    required: true,
    schema: { type: "string" },
    examples: { xml: { summary: "XML a validar", value: exemplo } },
  });
}

export function RespostaOk(descricao: string, exemplo: unknown) {
  return ApiOkResponse({
    description: descricao,
    content: { [APP_JSON]: { example: exemplo } },
  });
}

export function RespostaProblem422() {
  return ApiResponse({
    status: 422,
    description: "Inconsistência de entrada (ProblemDetail RFC 9457, código REG-xxx). No modo fail-fast a operação inteira é rejeitada.",
    content: { "application/problem+json": { example: PROBLEM_DETAIL_422 } },
  });
}
