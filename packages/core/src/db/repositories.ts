/**
 * Camada de acesso a dados — porte dos repositórios Spring Data (SQL já era
 * nativo/JPQL simples). SQLite somente-leitura via better-sqlite3 com
 * prepared statements (parâmetros nomeados) e cache LRU+TTL (espelho do
 * Caffeine original: dados fiscais são estáticos no banco distribuído).
 */
import Database from "better-sqlite3";
import { JBD } from "../model/jbd.js";
import type {
  AliquotaAdRemDTO,
  AliquotaAdValoremDTO,
  ClassificacaoTributariaCalculoDTO,
  ClassificacaoTributariaDTO,
  FundamentacaoClassificacaoDTO,
  SituacaoTributaria,
  TipoDfe,
  TratamentoClassificacaoDTO,
  TratamentoTributario,
} from "../model/types.js";
import {
  AliquotaReferenciaNaoEncontradaException,
  MunicipioNaoEncontradoException,
  TratamentoTributarioNaoEncontradoException,
} from "../errors.js";

// ─── Cache LRU + TTL simples (equivalente funcional das specs Caffeine) ─────

class CacheEntry<V> {
  constructor(readonly value: V, readonly expires: number) {}
}

export class LruTtlCache<V> {
  private map = new Map<string, CacheEntry<V>>();

  constructor(
    private readonly maxSize: number,
    private readonly ttlMs: number,
  ) {}

  get(key: string): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expires) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }

  set(key: string, value: V): void {
    if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, new CacheEntry(value, Date.now() + this.ttlMs));
  }
}

function cached<V>(cache: LruTtlCache<V>, key: string, fn: () => V): V {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const v = fn();
  cache.set(key, v);
  return v;
}

const bd = (v: unknown): JBD | null => (v === null || v === undefined ? null : JBD.of(v as number));
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// ─── AliquotaResultadoDTO (validações e formas de aplicação) ────────────────

export type FormaAplicacao = "SUBSTITUICAO" | "ACRESCIMO" | "DECRESCIMO";

export class AliquotaResultadoDTO {
  readonly valorReferencia: JBD;
  valorPadrao: JBD | null;
  readonly formaAplicacao: FormaAplicacao | null;

  constructor(valorReferencia: JBD | null, valorPadrao: JBD | null, formaAplicacao: FormaAplicacao | null) {
    if (valorReferencia === null) {
      throw new AliquotaReferenciaNaoEncontradaException();
    }
    if (valorReferencia.signum() < 0) {
      throw new Error("Alíquota de referência negativa");
    }
    if (valorPadrao !== null) {
      if (valorPadrao.signum() < 0) throw new Error("Alíquota padrão negativa");
      if (formaAplicacao === null) throw new Error("Forma de aplicação não definida");
      if (formaAplicacao === "ACRESCIMO") valorPadrao = valorReferencia.add(valorPadrao);
      else if (formaAplicacao === "DECRESCIMO") valorPadrao = valorReferencia.subtract(valorPadrao);
      else if (formaAplicacao !== "SUBSTITUICAO") throw new Error("Forma de aplicação não tratada");
      if (valorPadrao.signum() < 0) throw new Error("Alíquota aplicável negativa");
    } else if (formaAplicacao !== null) {
      throw new Error("Alíquota padrão não encontrada");
    }
    this.valorReferencia = valorReferencia;
    this.valorPadrao = valorPadrao;
    this.formaAplicacao = formaAplicacao;
  }

  valorAplicavel(): JBD {
    return this.valorPadrao !== null ? this.valorPadrao : this.valorReferencia;
  }
}

// ─── Repositórios ────────────────────────────────────────────────────────────

export class Repositories {
  private readonly db: Database.Database;
  private cClassTrib = new LruTtlCache<ClassificacaoTributariaDTO>(50_000, 24 * 3600_000);
  private cClassCalc = new LruTtlCache<ClassificacaoTributariaCalculoDTO>(10_000, 24 * 3600_000);
  private cTratClass = new LruTtlCache<TratamentoClassificacaoDTO>(50_000, 24 * 3600_000);
  private cTratTrib = new LruTtlCache<TratamentoTributario>(1_000, 24 * 3600_000);
  private cSituacao = new LruTtlCache<SituacaoTributaria | null>(10_000, 24 * 3600_000);
  private cCstExiste = new LruTtlCache<boolean>(10_000, 24 * 3600_000);
  private cAliquota = new LruTtlCache<AliquotaResultadoDTO>(200_000, 24 * 3600_000);
  private cTpDfe = new LruTtlCache<TipoDfe | null>(1_000, 30 * 24 * 3600_000);

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { readonly: true, fileMustExist: true });
    this.db.pragma("query_only = 1");
    this.db.pragma("mmap_size = 268435456");
  }

  close(): void {
    this.db.close();
  }

  // ── Classificação tributária ──

  buscarClassificacaoTributaria(codigo: string, idTributo: number, data: string): ClassificacaoTributariaDTO | null {
    return cached(this.cClassTrib, `${codigo}|${idTributo}|${data}`, () => {
      const row = this.db
        .prepare(
          `SELECT ct.CLTR_ID AS id, ct.CLTR_CD AS codigo, ct.CLTR_NOMENCLATURA AS nomenclatura, st.SITR_CD AS cst
           FROM CLASSIFICACAO_TRIBUTARIA ct
           JOIN SITUACAO_TRIBUTARIA st ON ct.CLTR_SITR_ID = st.SITR_ID
           JOIN TRIBUTO_SITUACAO_TRIBUTARIA tst ON tst.TRST_SITR_ID = st.SITR_ID
           JOIN TRIBUTO tb ON tst.TRST_TBTO_ID = tb.TBTO_ID
           WHERE ct.CLTR_CD = :codigo
             AND tb.TBTO_ID = :idTributo
             AND :data BETWEEN ct.CLTR_INICIO_VIGENCIA AND COALESCE(ct.CLTR_FIM_VIGENCIA, :data)
             AND :data BETWEEN st.SITR_INICIO_VIGENCIA AND COALESCE(st.SITR_FIM_VIGENCIA, :data)
             AND :data BETWEEN tst.TRST_INICIO_VIGENCIA AND COALESCE(tst.TRST_FIM_VIGENCIA, :data)
             AND :data BETWEEN tb.TBTO_INICIO_VIGENCIA AND COALESCE(tb.TBTO_FIM_VIGENCIA, :data)
           LIMIT 1`,
        )
        .get({ codigo, idTributo, data }) as
        | { id: number; codigo: string; nomenclatura: string | null; cst: string }
        | undefined;
      return row ? { id: Number(row.id), codigo: row.codigo, nomenclatura: row.nomenclatura, cst: row.cst } : null;
    });
  }

  buscarClassificacaoTributariaCalculo(id: number): ClassificacaoTributariaCalculoDTO | null {
    return cached(this.cClassCalc, `${id}`, () => {
      const row = this.db
        .prepare(
          `SELECT ct.CLTR_ID, ct.CLTR_CD, ct.CLTR_TIPO_ALIQUOTA, ct.CLTR_IND_GMONOPADRAO, ct.CLTR_IND_GMONORETEN,
                  ct.CLTR_IND_GMONORET, ct.CLTR_IND_GMONODIF, st.SITR_IND_GRED
           FROM CLASSIFICACAO_TRIBUTARIA ct
           JOIN SITUACAO_TRIBUTARIA st ON ct.CLTR_SITR_ID = st.SITR_ID
           WHERE ct.CLTR_ID = :id`,
        )
        .get({ id }) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        id: Number(row.CLTR_ID),
        codigo: String(row.CLTR_CD),
        tipoAliquota: (row.CLTR_TIPO_ALIQUOTA as string | null) ?? null,
        inGrupoMonofasiaPadrao: (num(row.CLTR_IND_GMONOPADRAO) as 0 | 1 | null) ?? null,
        inGrupoMonofasiaReten: (num(row.CLTR_IND_GMONORETEN) as 0 | 1 | null) ?? null,
        inGrupoMonofasiaRet: (num(row.CLTR_IND_GMONORET) as 0 | 1 | null) ?? null,
        inGrupoMonofasiaDiferimento: (num(row.CLTR_IND_GMONODIF) as 0 | 1 | null) ?? null,
        inGrupoReducao: (num(row.SITR_IND_GRED) as 0 | 1 | null) ?? null,
      };
    });
  }

  // ── Tratamento classificação / tributário ──

  buscarTratamentoClassificacao(idClassificacaoTributaria: number, data: string): TratamentoClassificacaoDTO | null {
    return cached(this.cTratClass, `${idClassificacaoTributaria}|${data}`, () => {
      const row = this.db
        .prepare(
          `SELECT tc.TRCL_TRTR_ID, tc.TRCL_CLTR_ID, tt.TRTR_IN_INCOMPATIVEL_COM_SUSPENSAO, tt.TRTR_IN_EXIGE_GRUPO_DESONERACAO
           FROM TRATAMENTO_CLASSIFICACAO tc
           JOIN TRATAMENTO_TRIBUTARIO tt ON tt.TRTR_ID = tc.TRCL_TRTR_ID
           WHERE tc.TRCL_CLTR_ID = :id
             AND tc.TRCL_INICIO_VIGENCIA <= :data
             AND (tc.TRCL_FIM_VIGENCIA IS NULL OR tc.TRCL_FIM_VIGENCIA >= :data)
           LIMIT 1`,
        )
        .get({ id: idClassificacaoTributaria, data }) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        idTratamentoTributario: Number(row.TRCL_TRTR_ID),
        idClassificacaoTributaria: Number(row.TRCL_CLTR_ID),
        inIncompativelComSuspensao: Number(row.TRTR_IN_INCOMPATIVEL_COM_SUSPENSAO) as 0 | 1,
        inExigeGrupoDesoneracao: Number(row.TRTR_IN_EXIGE_GRUPO_DESONERACAO) as 0 | 1,
      };
    });
  }

  buscarTratamentoTributario(id: number): TratamentoTributario {
    return cached(this.cTratTrib, `${id}`, () => {
      const row = this.db.prepare(`SELECT * FROM TRATAMENTO_TRIBUTARIO WHERE TRTR_ID = :id`).get({ id }) as
        | Record<string, unknown>
        | undefined;
      if (!row) throw new TratamentoTributarioNaoEncontradoException(id);
      return {
        id: Number(row.TRTR_ID),
        descricao: String(row.TRTR_DESCRICAO ?? ""),
        expressaoAliquota: (row.TRTR_EXPRESSAO_ALIQUOTA as string | null) ?? null,
        expressaoAliquotaEfetiva: (row.TRTR_EXPRESSAO_ALIQUOTA_EFETIVA as string | null) ?? null,
        expressaoBaseCalculo: (row.TRTR_EXPRESSAO_BASE_CALCULO as string | null) ?? null,
        expressaoTributoCalculado: (row.TRTR_EXPRESSAO_TRIBUTO_CALCULADO as string | null) ?? null,
        expressaoTributoDevido: (row.TRTR_EXPRESSAO_TRIBUTO_DEVIDO as string | null) ?? null,
        expressaoPercentualDiferimento: (row.TRTR_EXPRESSAO_PERCENTUAL_DIFERIMENTO as string | null) ?? null,
        expressaoValorDiferimento: (row.TRTR_EXPRESSAO_VALOR_DIFERIMENTO as string | null) ?? null,
        inIncompativelComSuspensao: Number(row.TRTR_IN_INCOMPATIVEL_COM_SUSPENSAO) as 0 | 1,
        inExigeGrupoDesoneracao: Number(row.TRTR_IN_EXIGE_GRUPO_DESONERACAO) as 0 | 1,
        inPossuiPercentualReducao: Number(row.TRTR_IN_POSSUI_PERCENTUAL_REDUCAO) as 0 | 1,
        inPossuiAjuste: Number(row.TRTR_IN_POSSUI_AJUSTE) as 0 | 1,
        inPossuiRedutor: Number(row.TRTR_IN_POSSUI_REDUTOR) as 0 | 1,
        inPossuiMonofasia: Number(row.TRTR_IN_POSSUI_MONOFASIA) as 0 | 1,
        inicioVigencia: String(row.TRTR_INICIO_VIGENCIA),
        fimVigencia: (row.TRTR_FIM_VIGENCIA as string | null) ?? null,
      };
    });
  }

  // ── Situação tributária ──

  existeCst(cst: string, idTributo: number, data: string): boolean {
    return cached(this.cCstExiste, `${cst}|${idTributo}|${data}`, () => {
      const row = this.db
        .prepare(
          `SELECT EXISTS (
             SELECT 1 FROM TRIBUTO_SITUACAO_TRIBUTARIA t
             JOIN SITUACAO_TRIBUTARIA s ON s.SITR_ID = t.TRST_SITR_ID
             WHERE t.TRST_TBTO_ID = :idTributo
               AND s.SITR_CD = :cst
               AND :data BETWEEN t.TRST_INICIO_VIGENCIA AND COALESCE(t.TRST_FIM_VIGENCIA, :data)
               AND :data BETWEEN s.SITR_INICIO_VIGENCIA AND COALESCE(s.SITR_FIM_VIGENCIA, :data)
           ) AS ok`,
        )
        .get({ cst, idTributo, data }) as { ok: number };
      return row.ok === 1;
    });
  }

  consultarSituacaoTributariaPorCodigo(cst: string | null, idTributo: number | null, data: string): SituacaoTributaria | null {
    return cached(this.cSituacao, `${cst}|${idTributo}|${data}`, () => {
      const row = this.db
        .prepare(
          `SELECT s.*
           FROM SITUACAO_TRIBUTARIA s
           JOIN TRIBUTO_SITUACAO_TRIBUTARIA tst ON tst.TRST_SITR_ID = s.SITR_ID
           JOIN TRIBUTO t ON t.TBTO_ID = tst.TRST_TBTO_ID
           WHERE COALESCE(s.SITR_CD, '') = COALESCE(:cst, '')
             AND COALESCE(t.TBTO_ID, 0) = COALESCE(:idTributo, 0)
             AND COALESCE(:data, '') BETWEEN COALESCE(tst.TRST_INICIO_VIGENCIA, '') AND COALESCE(tst.TRST_FIM_VIGENCIA, :data)
             AND COALESCE(:data, '') BETWEEN COALESCE(s.SITR_INICIO_VIGENCIA, '') AND COALESCE(s.SITR_FIM_VIGENCIA, :data)
             AND COALESCE(:data, '') BETWEEN COALESCE(t.TBTO_INICIO_VIGENCIA, '') AND COALESCE(t.TBTO_FIM_VIGENCIA, :data)
           LIMIT 1`,
        )
        .get({ cst, idTributo, data }) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        id: Number(row.SITR_ID),
        codigo: (row.SITR_CD as string | null) ?? null,
        descricao: (row.SITR_DESCRICAO as string | null) ?? null,
        inGrupoIbsCbs: (num(row.SITR_IND_GIBSCBS) as 0 | 1 | null) ?? null,
        inGrupoIbsCbsMono: (num(row.SITR_IND_GIBSCBSMONO) as 0 | 1 | null) ?? null,
        inGrupoReducao: (num(row.SITR_IND_GRED) as 0 | 1 | null) ?? null,
        inGrupoDiferimento: (num(row.SITR_IND_GDIF) as 0 | 1 | null) ?? null,
      };
    });
  }

  // ── Geografia ──

  consultarCodigoUf(sigla: string): number | null {
    const row = this.db.prepare(`SELECT UF_CD AS cd FROM UF WHERE UPPER(UF_SIGLA) = UPPER(:sigla)`).get({ sigla }) as
      | { cd: number }
      | undefined;
    return row ? Number(row.cd) : null;
  }

  existeUf(sigla: string): boolean {
    const row = this.db
      .prepare(`SELECT EXISTS (SELECT 1 FROM UF WHERE UPPER(UF_SIGLA) = UPPER(:sigla)) AS ok`)
      .get({ sigla }) as { ok: number };
    return row.ok === 1;
  }

  /** 0 = válido · 1 = não encontrado · 2 = não pertence à UF. */
  validarMunicipio(codigoMunicipio: number, siglaUf: string): number {
    const row = this.db
      .prepare(
        `SELECT CASE
           WHEN COUNT(m.MUNI_CD) = 0 THEN 1
           WHEN COUNT(m.MUNI_CD) > 0 AND LOWER(u.UF_SIGLA) != LOWER(:siglaUf) THEN 2
           ELSE 0
         END AS resultado
         FROM MUNICIPIO m JOIN UF u ON u.UF_CD = m.MUNI_UF_CD
         WHERE m.MUNI_CD = :codigoMunicipio`,
      )
      .get({ siglaUf, codigoMunicipio }) as { resultado: number };
    return Number(row.resultado);
  }

  siglaUfPorMunicipio(codigoMunicipio: number): string {
    const row = this.db
      .prepare(`SELECT u.UF_SIGLA AS sigla FROM MUNICIPIO m JOIN UF u ON u.UF_CD = m.MUNI_UF_CD WHERE m.MUNI_CD = :codigo`)
      .get({ codigo: codigoMunicipio }) as { sigla: string } | undefined;
    if (!row) throw new MunicipioNaoEncontradoException(codigoMunicipio);
    return row.sigla;
  }

  // ── Alíquotas ──

  buscarAliquotaResultado(idTributo: number, codigoUf: number | null, municipio: number | null, data: string): AliquotaResultadoDTO | null {
    return cached(this.cAliquota, `${idTributo}|${codigoUf}|${municipio}|${data}`, () => {
      const row = this.db
        .prepare(
          `SELECT r.ALRE_VALOR AS ref, p.ALPA_VALOR AS padr, p.ALPA_FORMA_APLICACAO AS forma
           FROM ALIQUOTA_REFERENCIA r
           LEFT JOIN ALIQUOTA_PADRAO p
             ON p.ALPA_ALRE_ID = r.ALRE_ID
             AND ((:municipio IS NULL AND p.ALPA_MUNI_CD IS NULL) OR (:municipio IS NOT NULL AND p.ALPA_MUNI_CD = :municipio))
             AND ((:uf IS NULL AND p.ALPA_UF_CD IS NULL) OR (:uf IS NOT NULL AND p.ALPA_UF_CD = :uf))
             AND p.ALPA_INICIO_VIGENCIA <= :data
             AND (p.ALPA_FIM_VIGENCIA IS NULL OR p.ALPA_FIM_VIGENCIA >= :data)
           WHERE r.ALRE_TBTO_ID = :idTributo
             AND r.ALRE_INICIO_VIGENCIA <= :data
             AND (r.ALRE_FIM_VIGENCIA IS NULL OR r.ALRE_FIM_VIGENCIA >= :data)
           LIMIT 1`,
        )
        .get({ municipio, uf: codigoUf, data, idTributo }) as
        | { ref: number; padr: number | null; forma: FormaAplicacao | null }
        | undefined;
      if (!row) return null;
      return new AliquotaResultadoDTO(bd(row.ref), bd(row.padr), row.forma);
    });
  }

  buscarAliquotaReferencia(idTributo: number, data: string): JBD {
    const row = this.db
      .prepare(
        `SELECT ALRE_VALOR AS valor FROM ALIQUOTA_REFERENCIA
         WHERE ALRE_TBTO_ID = :idTributo AND ALRE_INICIO_VIGENCIA <= :data
           AND (ALRE_FIM_VIGENCIA IS NULL OR ALRE_FIM_VIGENCIA >= :data)
         LIMIT 1`,
      )
      .get({ idTributo, data }) as { valor: number } | undefined;
    if (!row) throw new AliquotaReferenciaNaoEncontradaException(idTributo, data);
    return JBD.of(row.valor)!;
  }

  buscarPercentualReducao(idClassificacaoTributaria: number, idTributo: number, data: string): JBD | null {
    const row = this.db
      .prepare(
        `SELECT PERE_VALOR AS valor FROM PERCENTUAL_REDUCAO
         WHERE PERE_CLTR_ID = :id AND PERE_TBTO_ID = :idTributo
           AND PERE_INICIO_VIGENCIA <= :data AND (PERE_FIM_VIGENCIA IS NULL OR PERE_FIM_VIGENCIA >= :data)
         LIMIT 1`,
      )
      .get({ id: idClassificacaoTributaria, idTributo, data }) as { valor: number } | undefined;
    return row ? JBD.of(row.valor)! : null;
  }

  buscarValorRedutorCompraGov(data: string): JBD | null {
    const row = this.db
      .prepare(
        `SELECT RCGO_VALOR AS valor FROM REDUTOR_COMPRA_GOVERNAMENTAL
         WHERE RCGO_INICIO_VIGENCIA <= :data AND (RCGO_FIM_VIGENCIA IS NULL OR RCGO_FIM_VIGENCIA >= :data)
         LIMIT 1`,
      )
      .get({ data }) as { valor: number } | undefined;
    return row ? JBD.of(row.valor)! : null;
  }

  getPercentualTransferenciaCBS(data: string): JBD | null {
    const row = this.db
      .prepare(
        `SELECT TCEG_VALOR AS valor FROM TRANSFERENCIA_CBS_ENTE_GOV
         WHERE TCEG_INICIO_VIGENCIA <= :data AND (TCEG_FIM_VIGENCIA IS NULL OR TCEG_FIM_VIGENCIA >= :data)
         LIMIT 1`,
      )
      .get({ data }) as { valor: number } | undefined;
    return row ? JBD.of(row.valor)! : null;
  }

  // ── Tipo DF-e ──

  buscarTipoDfePorTipo(tipo: number, data: string): TipoDfe | null {
    return cached(this.cTpDfe, `${tipo}|${data}`, () => {
      const row = this.db
        .prepare(
          `SELECT TPDF_ID, TPDF_TIPO, TPDF_SIGLA, TPDF_DESCRICAO FROM TIPO_DFE
           WHERE TPDF_TIPO = :tipo
             AND :data BETWEEN TPDF_INICIO_VIGENCIA AND COALESCE(TPDF_FIM_VIGENCIA, :data)
           LIMIT 1`,
        )
        .get({ tipo, data }) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        id: Number(row.TPDF_ID),
        tipo: Number(row.TPDF_TIPO),
        sigla: String(row.TPDF_SIGLA),
        descricao: String(row.TPDF_DESCRICAO ?? ""),
      };
    });
  }

  tiposDfeVinculados(idClassificacaoTributaria: number, data: string): number[] {
    const rows = this.db
      .prepare(
        `SELECT TDCL_TPDF_ID AS id FROM TIPO_DFE_CLASSIFICACAO
         WHERE TDCL_CLTR_ID = :id
           AND :data BETWEEN TDCL_INICIO_VIGENCIA AND COALESCE(TDCL_FIM_VIGENCIA, :data)`,
      )
      .all({ id: idClassificacaoTributaria, data }) as Array<{ id: number }>;
    return rows.map((r) => Number(r.id));
  }

  buscarTipoDfePorIds(ids: number[], _data: string): string[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map((_, i) => `:id${i}`).join(",");
    const params: Record<string, number> = {};
    ids.forEach((id, i) => (params[`id${i}`] = id));
    const rows = this.db
      .prepare(`SELECT TPDF_SIGLA AS sigla FROM TIPO_DFE WHERE TPDF_ID IN (${placeholders})`)
      .all(params) as Array<{ sigla: string }>;
    return rows.map((r) => r.sigla);
  }

  // ── Nomenclaturas ──

  existeNcm(ncm: string, data: string): boolean {
    const row = this.db
      .prepare(
        `SELECT EXISTS (SELECT 1 FROM NCM WHERE NCM_CD = :ncm
           AND :data BETWEEN NCM_INICIO_VIGENCIA AND COALESCE(NCM_FIM_VIGENCIA, :data)) AS ok`,
      )
      .get({ ncm, data }) as { ok: number };
    return row.ok === 1;
  }

  existeNbs(nbs: string, data: string): boolean {
    const row = this.db
      .prepare(
        `SELECT EXISTS (SELECT 1 FROM NBS WHERE NBS_CD = :nbs
           AND :data BETWEEN NBS_INICIO_VIGENCIA AND COALESCE(NBS_FIM_VIGENCIA, :data)) AS ok`,
      )
      .get({ nbs, data }) as { ok: number };
    return row.ok === 1;
  }

  temNcmAplicavel(idClassificacaoTributaria: number, data: string): boolean {
    const row = this.db
      .prepare(
        `SELECT EXISTS (SELECT 1 FROM NCM_APLICAVEL WHERE NCMA_CLTR_ID = :id
           AND :data BETWEEN NCMA_INICIO_VIGENCIA AND COALESCE(NCMA_FIM_VIGENCIA, :data)) AS ok`,
      )
      .get({ id: idClassificacaoTributaria, data }) as { ok: number };
    return row.ok === 1;
  }

  temNbsAplicavel(idClassificacaoTributaria: number, data: string): boolean {
    const row = this.db
      .prepare(
        `SELECT EXISTS (SELECT 1 FROM NBS_APLICAVEL WHERE NBSA_CLTR_ID = :id
           AND :data BETWEEN NBSA_INICIO_VIGENCIA AND COALESCE(NBSA_FIM_VIGENCIA, :data)) AS ok`,
      )
      .get({ id: idClassificacaoTributaria, data }) as { ok: number };
    return row.ok === 1;
  }

  /** Vínculo por PREFIXO: NCMA_NCM_CD (2/4/6/8 dígitos) deve ser prefixo do NCM informado. */
  temNcmAplicavelPara(ncm: string, idClassificacaoTributaria: number, data: string): boolean {
    const row = this.db
      .prepare(
        `SELECT EXISTS (
           SELECT 1 FROM NCM_APLICAVEL n
           WHERE n.NCMA_NCM_CD = SUBSTRING(:ncm, 1, LENGTH(n.NCMA_NCM_CD))
             AND n.NCMA_CLTR_ID = :id
             AND :data BETWEEN n.NCMA_INICIO_VIGENCIA AND COALESCE(n.NCMA_FIM_VIGENCIA, :data)
         ) AS ok`,
      )
      .get({ ncm, id: idClassificacaoTributaria, data }) as { ok: number };
    return row.ok === 1;
  }

  temExcecaoNcmAplicavelAtiva(ncm: string, idClassificacaoTributaria: number, data: string): boolean {
    const row = this.db
      .prepare(
        `SELECT EXISTS (
           SELECT 1 FROM EXCECAO_NCM_APLICAVEL e
           JOIN NCM_APLICAVEL n ON n.NCMA_ID = e.ENCM_NCMA_ID
           WHERE n.NCMA_NCM_CD = SUBSTRING(:ncm, 1, LENGTH(n.NCMA_NCM_CD))
             AND e.ENCM_NCM_CD = SUBSTRING(:ncm, 1, LENGTH(e.ENCM_NCM_CD))
             AND n.NCMA_CLTR_ID = :id
             AND :data BETWEEN e.ENCM_INICIO_VIGENCIA AND COALESCE(e.ENCM_FIM_VIGENCIA, :data)
         ) AS ok`,
      )
      .get({ ncm, id: idClassificacaoTributaria, data }) as { ok: number };
    return row.ok === 1;
  }

  temNcmAplicavelSemExcecao(ncm: string, idClassificacaoTributaria: number, data: string): boolean {
    const row = this.db
      .prepare(
        `SELECT EXISTS (
           SELECT 1 FROM NCM_APLICAVEL n
           LEFT JOIN EXCECAO_NCM_APLICAVEL e ON e.ENCM_NCMA_ID = n.NCMA_ID
           WHERE n.NCMA_NCM_CD = SUBSTRING(:ncm, 1, LENGTH(n.NCMA_NCM_CD))
             AND n.NCMA_CLTR_ID = :id
             AND :data BETWEEN n.NCMA_INICIO_VIGENCIA AND COALESCE(n.NCMA_FIM_VIGENCIA, :data)
             AND (e.ENCM_ID IS NULL OR :data NOT BETWEEN e.ENCM_INICIO_VIGENCIA AND COALESCE(e.ENCM_FIM_VIGENCIA, :data))
         ) AS ok`,
      )
      .get({ ncm, id: idClassificacaoTributaria, data }) as { ok: number };
    return row.ok === 1;
  }

  temNbsAplicavelPara(nbs: string, idClassificacaoTributaria: number, data: string): boolean {
    const row = this.db
      .prepare(
        `SELECT EXISTS (
           SELECT 1 FROM NBS_APLICAVEL n
           WHERE n.NBSA_NBS_CD = SUBSTRING(:nbs, 1, LENGTH(n.NBSA_NBS_CD))
             AND n.NBSA_CLTR_ID = :id
             AND :data BETWEEN n.NBSA_INICIO_VIGENCIA AND COALESCE(n.NBSA_FIM_VIGENCIA, :data)
         ) AS ok`,
      )
      .get({ nbs, id: idClassificacaoTributaria, data }) as { ok: number };
    return row.ok === 1;
  }

  temExcecaoNbsAplicavelAtiva(nbs: string, idClassificacaoTributaria: number, data: string): boolean {
    const row = this.db
      .prepare(
        `SELECT EXISTS (
           SELECT 1 FROM EXCECAO_NBS_APLICAVEL e
           JOIN NBS_APLICAVEL n ON n.NBSA_ID = e.ENBS_NBSA_ID
           WHERE n.NBSA_NBS_CD = SUBSTRING(:nbs, 1, LENGTH(n.NBSA_NBS_CD))
             AND e.ENBS_NBS_CD = SUBSTRING(:nbs, 1, LENGTH(e.ENBS_NBS_CD))
             AND n.NBSA_CLTR_ID = :id
             AND :data BETWEEN e.ENBS_INICIO_VIGENCIA AND COALESCE(e.ENBS_FIM_VIGENCIA, :data)
         ) AS ok`,
      )
      .get({ nbs, id: idClassificacaoTributaria, data }) as { ok: number };
    return row.ok === 1;
  }

  temNbsAplicavelSemExcecao(nbs: string, idClassificacaoTributaria: number, data: string): boolean {
    const row = this.db
      .prepare(
        `SELECT EXISTS (
           SELECT 1 FROM NBS_APLICAVEL n
           LEFT JOIN EXCECAO_NBS_APLICAVEL e ON e.ENBS_NBSA_ID = n.NBSA_ID
           WHERE n.NBSA_NBS_CD = SUBSTRING(:nbs, 1, LENGTH(n.NBSA_NBS_CD))
             AND n.NBSA_CLTR_ID = :id
             AND :data BETWEEN n.NBSA_INICIO_VIGENCIA AND COALESCE(n.NBSA_FIM_VIGENCIA, :data)
             AND (e.ENBS_ID IS NULL OR :data NOT BETWEEN e.ENBS_INICIO_VIGENCIA AND COALESCE(e.ENBS_FIM_VIGENCIA, :data))
         ) AS ok`,
      )
      .get({ nbs, id: idClassificacaoTributaria, data }) as { ok: number };
    return row.ok === 1;
  }

  // ── Alíquotas ad valorem / ad rem ──

  buscarAliquotaAdValoremProduto(ncm: string, idTributo: number, data: string): AliquotaAdValoremDTO | null {
    const row = this.db
      .prepare(
        `SELECT a.AADV_VALOR AS valor
         FROM ALIQUOTA_AD_VALOREM_PRODUTO p
         JOIN ALIQUOTA_AD_VALOREM a ON a.AADV_ID = p.AAVP_AADV_ID
         WHERE p.AAVP_NCM_CD = :ncm AND a.AADV_TBTO_ID = :idTributo
           AND :data BETWEEN p.AAVP_INICIO_VIGENCIA AND COALESCE(p.AAVP_FIM_VIGENCIA, :data)
           AND :data BETWEEN a.AADV_INICIO_VIGENCIA AND COALESCE(a.AADV_FIM_VIGENCIA, :data)
         LIMIT 1`,
      )
      .get({ ncm, idTributo, data }) as { valor: number } | undefined;
    return row ? { valor: JBD.of(row.valor)! } : null;
  }

  existeNcmAdValorem(ncm: string, idTributo: number, data: string): boolean {
    const row = this.db
      .prepare(
        `SELECT EXISTS (
           SELECT 1 FROM ALIQUOTA_AD_VALOREM_PRODUTO p
           JOIN ALIQUOTA_AD_VALOREM a ON a.AADV_ID = p.AAVP_AADV_ID
           WHERE p.AAVP_NCM_CD = :ncm AND a.AADV_TBTO_ID = :idTributo
             AND :data BETWEEN p.AAVP_INICIO_VIGENCIA AND COALESCE(p.AAVP_FIM_VIGENCIA, :data)
             AND :data BETWEEN a.AADV_INICIO_VIGENCIA AND COALESCE(a.AADV_FIM_VIGENCIA, :data)
         ) AS ok`,
      )
      .get({ ncm, idTributo, data }) as { ok: number };
    return row.ok === 1;
  }

  buscarAliquotaAdRemProduto(ncm: string, idTributo: number, data: string): AliquotaAdRemDTO | null {
    const row = this.db
      .prepare(
        `SELECT a.AARE_VALOR AS valor, u.UNMD_SIGLA AS unidade
         FROM ALIQUOTA_AD_REM_PRODUTO p
         JOIN ALIQUOTA_AD_REM a ON a.AARE_ID = p.AARP_AARE_ID
         JOIN UNIDADE_MEDIDA u ON u.UNMD_ID = a.AARE_UNMD_ID
         WHERE p.AARP_NCM_CD = :ncm AND a.AARE_TBTO_ID = :idTributo
           AND :data BETWEEN p.AARP_INICIO_VIGENCIA AND COALESCE(p.AARP_FIM_VIGENCIA, :data)
           AND :data BETWEEN a.AARE_INICIO_VIGENCIA AND COALESCE(a.AARE_FIM_VIGENCIA, :data)
         LIMIT 1`,
      )
      .get({ ncm, idTributo, data }) as { valor: number; unidade: string } | undefined;
    return row ? { valor: JBD.of(row.valor)!, unidadeMedida: row.unidade } : null;
  }

  buscarAliquotaAdValoremServico(nbs: string, idTributo: number, idCltr: number | null, data: string): JBD | null {
    const row = this.db
      .prepare(
        `SELECT a.AADV_VALOR AS valor
         FROM ALIQUOTA_AD_VALOREM_SERVICO s
         JOIN ALIQUOTA_AD_VALOREM a ON a.AADV_ID = s.AAVS_AADV_ID
         WHERE s.AAVS_NBS_CD = :nbs AND a.AADV_TBTO_ID = :idTributo
           AND (:idCltr IS NULL OR a.AADV_CLTR_ID IS NULL OR a.AADV_CLTR_ID = :idCltr)
           AND :data BETWEEN s.AAVS_INICIO_VIGENCIA AND COALESCE(s.AAVS_FIM_VIGENCIA, :data)
           AND :data BETWEEN a.AADV_INICIO_VIGENCIA AND COALESCE(a.AADV_FIM_VIGENCIA, :data)
         LIMIT 1`,
      )
      .get({ nbs, idTributo, idCltr, data }) as { valor: number } | undefined;
    return row ? JBD.of(row.valor)! : null;
  }

  existeNbsAdValorem(nbs: string, idTributo: number, data: string): boolean {
    const row = this.db
      .prepare(
        `SELECT EXISTS (
           SELECT 1 FROM ALIQUOTA_AD_VALOREM_SERVICO s
           JOIN ALIQUOTA_AD_VALOREM a ON a.AADV_ID = s.AAVS_AADV_ID
           WHERE s.AAVS_NBS_CD = :nbs AND a.AADV_TBTO_ID = :idTributo
             AND :data BETWEEN s.AAVS_INICIO_VIGENCIA AND COALESCE(s.AAVS_FIM_VIGENCIA, :data)
             AND :data BETWEEN a.AADV_INICIO_VIGENCIA AND COALESCE(a.AADV_FIM_VIGENCIA, :data)
         ) AS ok`,
      )
      .get({ nbs, idTributo, data }) as { ok: number };
    return row.ok === 1;
  }

  buscarAliquotaAdValoremPorClassificacaoTributaria(idTributo: number, idCltr: number, data: string): JBD | null {
    const row = this.db
      .prepare(
        `SELECT AADV_VALOR AS valor FROM ALIQUOTA_AD_VALOREM
         WHERE AADV_TBTO_ID = :idTributo AND AADV_CLTR_ID = :idCltr
           AND :data BETWEEN AADV_INICIO_VIGENCIA AND COALESCE(AADV_FIM_VIGENCIA, :data)
         LIMIT 1`,
      )
      .get({ idTributo, idCltr, data }) as { valor: number } | undefined;
    return row ? JBD.of(row.valor)! : null;
  }

  // ── Fundamentação ──

  buscarFundamentacaoClassificacao(idClassificacaoTributaria: number, data: string): FundamentacaoClassificacaoDTO | null {
    const row = this.db
      .prepare(
        `SELECT fl.FDLG_TEXTO_CURTO AS textoCurto, ct.CLTR_MEMORIA_CALCULO AS memoria
         FROM FUNDAMENTACAO_CLASSIFICACAO fc
         JOIN FUNDAMENTACAO_LEGAL fl ON fl.FDLG_ID = fc.FDCL_FDLG_ID
         JOIN CLASSIFICACAO_TRIBUTARIA ct ON ct.CLTR_ID = fc.FDCL_CLTR_ID
         WHERE fc.FDCL_CLTR_ID = :id
           AND :data BETWEEN fc.FDCL_INICIO_VIGENCIA AND COALESCE(fc.FDCL_FIM_VIGENCIA, :data)
         LIMIT 1`,
      )
      .get({ id: idClassificacaoTributaria, data }) as { textoCurto: string | null; memoria: string | null } | undefined;
    return row ? { textoCurto: row.textoCurto, memoriaCalculo: row.memoria } : null;
  }


  // ── NFS-e: indicador de operação ──

  validarCombinacaoIndicadorOperacao(nbs: string, cClassTrib: string, cIndOp: string, cTribNac: string | null, data: string): boolean {
    const row = this.db
      .prepare(
        `SELECT EXISTS (
            SELECT 1
            FROM CLASSIF_NBS_INDOP_LC c
            INNER JOIN CLASSIFICACAO_TRIBUTARIA ct ON c.CNIL_CLTR_ID = ct.CLTR_ID
            INNER JOIN INDICADOR_OPERACAO_IBS_CBS io ON c.CNIL_IOIC_ID = io.IOIC_ID
            WHERE c.CNIL_NBS_CD = :nbs
              AND ct.CLTR_CD = :cClassTrib
              AND io.IOIC_CD = :cIndOp
              AND (:cTribNac IS NULL OR c.CNIL_LSLC_CD = :cTribNac)
              AND c.CNIL_INICIO_VIGENCIA <= :data
              AND (c.CNIL_FIM_VIGENCIA IS NULL OR c.CNIL_FIM_VIGENCIA >= :data)
         ) AS ok`,
      )
      .get({ nbs, cClassTrib, cIndOp, cTribNac, data }) as { ok: number };
    return row.ok === 1;
  }

  buscarLocalOperacaoPorIndOp(cIndOp: string, data: string): { localFornecimento: number | null; localIncidencia: number | null } | null {
    const row = this.db
      .prepare(
        `SELECT io.IOIC_CD_LOCAL_FORNECIMENTO_DFE AS fornecimento, io.IOIC_CD_LOCAL_INCIDENCIA AS incidencia
         FROM INDICADOR_OPERACAO_IBS_CBS io
         WHERE io.IOIC_CD = :cIndOp
           AND :data BETWEEN io.IOIC_INICIO_VIGENCIA AND COALESCE(io.IOIC_FIM_VIGENCIA, :data)`,
      )
      .get({ cIndOp, data }) as { fornecimento: number | null; incidencia: number | null } | undefined;
    if (!row) return null;
    return {
      localFornecimento: row.fornecimento !== null ? Number(row.fornecimento) : null,
      localIncidencia: row.incidencia !== null ? Number(row.incidencia) : null,
    };
  }

  buscarIndicadoresOperacao(data: string, nbs: string | null): Array<{ cIndOp: string; tipoOperacao: string | null; localFornecimento: number | null; localIncidencia: number | null; prestacaoServicoOnerosa: boolean | null; adquirenteExterior: boolean | null }> {
    const sql = nbs
      ? `SELECT DISTINCT io.IOIC_CD AS cIndOp, io.IOIC_TIPO_OPERACAO AS tipo, io.IOIC_CD_LOCAL_FORNECIMENTO_DFE AS fornec,
                io.IOIC_CD_LOCAL_INCIDENCIA AS incid, c.CNIL_IN_PS_ONEROSA AS onerosa, c.CNIL_IN_ADQ_EXTERIOR AS exterior
         FROM INDICADOR_OPERACAO_IBS_CBS io
         INNER JOIN CLASSIF_NBS_INDOP_LC c ON io.IOIC_ID = c.CNIL_IOIC_ID
         WHERE c.CNIL_NBS_CD = :nbs
           AND :data BETWEEN io.IOIC_INICIO_VIGENCIA AND COALESCE(io.IOIC_FIM_VIGENCIA, :data)
           AND :data BETWEEN c.CNIL_INICIO_VIGENCIA AND COALESCE(c.CNIL_FIM_VIGENCIA, :data)
           AND io.IOIC_TIPO_OPERACAO IS NOT NULL
         ORDER BY io.IOIC_CD`
      : `SELECT io.IOIC_CD AS cIndOp, io.IOIC_TIPO_OPERACAO AS tipo, io.IOIC_CD_LOCAL_FORNECIMENTO_DFE AS fornec,
                io.IOIC_CD_LOCAL_INCIDENCIA AS incid, NULL AS onerosa, NULL AS exterior
         FROM INDICADOR_OPERACAO_IBS_CBS io
         WHERE io.IOIC_TIPO_OPERACAO IS NOT NULL
           AND :data BETWEEN io.IOIC_INICIO_VIGENCIA AND COALESCE(io.IOIC_FIM_VIGENCIA, :data)
         ORDER BY io.IOIC_CD`;
    const rows = this.db.prepare(sql).all(nbs ? { nbs, data } : { data }) as Array<{
      cIndOp: string; tipo: string | null; fornec: number | null; incid: number | null; onerosa: number | null; exterior: number | null;
    }>;
    return rows.map((r) => ({
      cIndOp: r.cIndOp,
      tipoOperacao: r.tipo,
      localFornecimento: r.fornec !== null ? Number(r.fornec) : null,
      localIncidencia: r.incid !== null ? Number(r.incid) : null,
      prestacaoServicoOnerosa: r.onerosa !== null ? Number(r.onerosa) === 1 : null,
      adquirenteExterior: r.exterior !== null ? Number(r.exterior) === 1 : null,
    }));
  }

  buscarSituacoesClassificacoesPorNbs(nbs: string, data: string): Array<{ codigoSituacaoTributaria: string; descricaoSituacaoTributaria: string; codigoClassificacaoTributaria: string; descricaoClassificacaoTributaria: string }> {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT st.SITR_CD AS cst, st.SITR_DESCRICAO AS dst, ct.CLTR_CD AS ccl, ct.CLTR_DESCRICAO AS dcl
         FROM CLASSIF_NBS_INDOP_LC c
         INNER JOIN CLASSIFICACAO_TRIBUTARIA ct ON c.CNIL_CLTR_ID = ct.CLTR_ID
         INNER JOIN SITUACAO_TRIBUTARIA st ON ct.CLTR_SITR_ID = st.SITR_ID
         WHERE c.CNIL_NBS_CD = :nbs
           AND :data BETWEEN c.CNIL_INICIO_VIGENCIA AND COALESCE(c.CNIL_FIM_VIGENCIA, :data)
           AND :data BETWEEN ct.CLTR_INICIO_VIGENCIA AND COALESCE(ct.CLTR_FIM_VIGENCIA, :data)
           AND :data BETWEEN st.SITR_INICIO_VIGENCIA AND COALESCE(st.SITR_FIM_VIGENCIA, :data)
         ORDER BY ct.CLTR_CD, st.SITR_CD`,
      )
      .all({ nbs, data }) as Array<{ cst: string; dst: string; ccl: string; dcl: string }>;
    return rows.map((r) => ({
      codigoSituacaoTributaria: r.cst,
      descricaoSituacaoTributaria: r.dst,
      codigoClassificacaoTributaria: r.ccl,
      descricaoClassificacaoTributaria: r.dcl,
    }));
  }

  // ── Dados abertos adicionais ──

  classificacoesPorCst(cst: string, idTributo: number, data: string) {
    return this.db
      .prepare(
        `SELECT ct.CLTR_CD AS codigo, ct.CLTR_DESCRICAO AS descricao, ct.CLTR_TIPO_ALIQUOTA AS tipoAliquota
         FROM CLASSIFICACAO_TRIBUTARIA ct
         JOIN SITUACAO_TRIBUTARIA st ON ct.CLTR_SITR_ID = st.SITR_ID
         JOIN TRIBUTO_SITUACAO_TRIBUTARIA tst ON tst.TRST_SITR_ID = st.SITR_ID
         WHERE st.SITR_CD = :cst AND tst.TRST_TBTO_ID = :idTributo
           AND :data BETWEEN ct.CLTR_INICIO_VIGENCIA AND COALESCE(ct.CLTR_FIM_VIGENCIA, :data)
           AND :data BETWEEN st.SITR_INICIO_VIGENCIA AND COALESCE(st.SITR_FIM_VIGENCIA, :data)
           AND :data BETWEEN tst.TRST_INICIO_VIGENCIA AND COALESCE(tst.TRST_FIM_VIGENCIA, :data)
         ORDER BY ct.CLTR_CD`,
      )
      .all({ cst, idTributo, data });
  }

  redutoresCompraGovernamental(data: string) {
    return this.db
      .prepare(
        `SELECT RCGO_VALOR AS valor, RCGO_INICIO_VIGENCIA AS inicioVigencia, RCGO_FIM_VIGENCIA AS fimVigencia
         FROM REDUTOR_COMPRA_GOVERNAMENTAL
         WHERE RCGO_INICIO_VIGENCIA <= :data AND (RCGO_FIM_VIGENCIA IS NULL OR RCGO_FIM_VIGENCIA >= :data)`,
      )
      .all({ data });
  }

  transferenciasCBS(data: string) {
    return this.db
      .prepare(
        `SELECT TCEG_VALOR AS valor, TCEG_INICIO_VIGENCIA AS inicioVigencia, TCEG_FIM_VIGENCIA AS fimVigencia
         FROM TRANSFERENCIA_CBS_ENTE_GOV
         WHERE TCEG_INICIO_VIGENCIA <= :data AND (TCEG_FIM_VIGENCIA IS NULL OR TCEG_FIM_VIGENCIA >= :data)`,
      )
      .all({ data });
  }

  unidadesMedida(data: string) {
    return this.db
      .prepare(
        `SELECT UNMD_SIGLA AS sigla, UNMD_NOME AS nome
         FROM UNIDADE_MEDIDA
         WHERE :data BETWEEN UNMD_INICIO_VIGENCIA AND COALESCE(UNMD_FIM_VIGENCIA, :data)
         ORDER BY UNMD_SIGLA`,
      )
      .all({ data });
  }

  // ── Versão da base ──

  versaoBaseDados(): { versao: string; data: string } {
    const row = this.db
      .prepare(`SELECT VRBD_VERSAO_BASE_DADO AS versao, VRBD_DATA AS data FROM VERSAO_BASE_DADO ORDER BY VRBD_ID DESC LIMIT 1`)
      .get() as { versao: string; data: string };
    return { versao: row.versao, data: row.data };
  }
}
