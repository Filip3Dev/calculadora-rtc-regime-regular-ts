/**
 * Consultas de dados abertos (UFs, municípios, cClassTrib, CST, NCM/NBS,
 * alíquotas de referência, fundamentações) — leitura direta do SQLite ro.
 */
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export class DadosAbertosService {
  private readonly db: Database.Database;

  constructor(dbPath?: string) {
    this.db = new Database(dbPath ?? path.resolve(here, "../../../db/calculadora.db"), {
      readonly: true,
      fileMustExist: true,
    });
  }

  close(): void {
    this.db.close();
  }

  ufs() {
    return this.db
      .prepare(`SELECT UF_CD AS codigo, UF_SIGLA AS sigla, UF_NOME AS nome FROM UF ORDER BY UF_SIGLA`)
      .all();
  }

  municipios(ufSigla: string) {
    return this.db
      .prepare(
        `SELECT m.MUNI_CD AS codigo, m.MUNI_NOME AS nome, u.UF_SIGLA AS uf
         FROM MUNICIPIO m JOIN UF u ON u.UF_CD = m.MUNI_UF_CD
         WHERE UPPER(u.UF_SIGLA) = UPPER(:uf) ORDER BY m.MUNI_NOME`,
      )
      .all({ uf: ufSigla });
  }

  classificacoesTributarias(data: string) {
    return this.db
      .prepare(
        `SELECT ct.CLTR_CD AS codigo, ct.CLTR_DESCRICAO AS descricao, ct.CLTR_TIPO_ALIQUOTA AS tipoAliquota,
                st.SITR_CD AS cst, fl.FDLG_TEXTO_CURTO AS fundamentacao
         FROM CLASSIFICACAO_TRIBUTARIA ct
         JOIN SITUACAO_TRIBUTARIA st ON st.SITR_ID = ct.CLTR_SITR_ID
         LEFT JOIN FUNDAMENTACAO_CLASSIFICACAO fc ON fc.FDCL_CLTR_ID = ct.CLTR_ID
              AND :data BETWEEN fc.FDCL_INICIO_VIGENCIA AND COALESCE(fc.FDCL_FIM_VIGENCIA, :data)
         LEFT JOIN FUNDAMENTACAO_LEGAL fl ON fl.FDLG_ID = fc.FDCL_FDLG_ID
         WHERE :data BETWEEN ct.CLTR_INICIO_VIGENCIA AND COALESCE(ct.CLTR_FIM_VIGENCIA, :data)
         ORDER BY ct.CLTR_CD`,
      )
      .all({ data });
  }

  classificacaoTributaria(codigo: string, data: string) {
    return (
      this.db
        .prepare(
          `SELECT ct.CLTR_CD AS codigo, ct.CLTR_DESCRICAO AS descricao, ct.CLTR_MEMORIA_CALCULO AS memoriaCalculo,
                  ct.CLTR_TIPO_ALIQUOTA AS tipoAliquota, ct.CLTR_NOMENCLATURA AS nomenclatura, st.SITR_CD AS cst
           FROM CLASSIFICACAO_TRIBUTARIA ct
           JOIN SITUACAO_TRIBUTARIA st ON st.SITR_ID = ct.CLTR_SITR_ID
           WHERE ct.CLTR_CD = :codigo
             AND :data BETWEEN ct.CLTR_INICIO_VIGENCIA AND COALESCE(ct.CLTR_FIM_VIGENCIA, :data)`,
        )
        .get({ codigo, data }) ?? null
    );
  }

  situacoesTributarias(tributo: "cbs-ibs" | "is", data: string) {
    const idTributo = tributo === "is" ? 1 : 2;
    return this.db
      .prepare(
        `SELECT DISTINCT st.SITR_CD AS codigo, st.SITR_DESCRICAO AS descricao,
                st.SITR_IND_GIBSCBS AS grupoIbsCbs, st.SITR_IND_GRED AS grupoReducao
         FROM SITUACAO_TRIBUTARIA st
         JOIN TRIBUTO_SITUACAO_TRIBUTARIA tst ON tst.TRST_SITR_ID = st.SITR_ID
         WHERE tst.TRST_TBTO_ID = :idTributo
           AND :data BETWEEN st.SITR_INICIO_VIGENCIA AND COALESCE(st.SITR_FIM_VIGENCIA, :data)
           AND :data BETWEEN tst.TRST_INICIO_VIGENCIA AND COALESCE(tst.TRST_FIM_VIGENCIA, :data)
         ORDER BY st.SITR_CD`,
      )
      .all({ idTributo, data });
  }

  ncm(prefixo: string, limite: number, pagina: number) {
    const where = prefixo ? "WHERE NCM_CD LIKE :prefixo" : "";
    const params: Record<string, unknown> = {
      limite,
      offset: pagina * limite,
    };
    if (prefixo) params.prefixo = `${prefixo}%`;
    const countParams = prefixo ? { prefixo: `${prefixo}%` } : {};
    const total = (this.db.prepare(`SELECT COUNT(*) AS c FROM NCM ${where}`).get(countParams) as { c: number }).c;
    const itens = this.db
      .prepare(
        `SELECT NCM_CD AS codigo, NCM_DESCRICAO AS descricao FROM NCM ${where}
         ORDER BY NCM_CD LIMIT :limite OFFSET :offset`,
      )
      .all(params);
    return { total, pagina, limite, itens };
  }

  nbs(prefixo: string, limite: number, pagina: number) {
    const where = prefixo ? "WHERE NBS_CD LIKE :prefixo" : "";
    const params: Record<string, unknown> = { limite, offset: pagina * limite };
    if (prefixo) params.prefixo = `${prefixo}%`;
    const countParams = prefixo ? { prefixo: `${prefixo}%` } : {};
    const total = (this.db.prepare(`SELECT COUNT(*) AS c FROM NBS ${where}`).get(countParams) as { c: number }).c;
    const itens = this.db
      .prepare(
        `SELECT NBS_CD AS codigo, NBS_DESCRICAO AS descricao FROM NBS ${where}
         ORDER BY NBS_CD LIMIT :limite OFFSET :offset`,
      )
      .all(params);
    return { total, pagina, limite, itens };
  }

  aliquotasReferencia(data: string) {
    return this.db
      .prepare(
        `SELECT t.TBTO_SIGLA AS tributo, t.TBTO_NOME AS nome, r.ALRE_VALOR AS valor
         FROM ALIQUOTA_REFERENCIA r JOIN TRIBUTO t ON t.TBTO_ID = r.ALRE_TBTO_ID
         WHERE :data BETWEEN r.ALRE_INICIO_VIGENCIA AND COALESCE(r.ALRE_FIM_VIGENCIA, :data)
           AND :data BETWEEN t.TBTO_INICIO_VIGENCIA AND COALESCE(t.TBTO_FIM_VIGENCIA, :data)`,
      )
      .all({ data });
  }

  fundamentacoes(data: string) {
    return this.db
      .prepare(
        `SELECT fl.FDLG_TEXTO_CURTO AS textoCurto, fl.FDLG_REFERENCIA_NORMATIVA AS norma, ct.CLTR_CD AS cClassTrib
         FROM FUNDAMENTACAO_CLASSIFICACAO fc
         JOIN FUNDAMENTACAO_LEGAL fl ON fl.FDLG_ID = fc.FDCL_FDLG_ID
         JOIN CLASSIFICACAO_TRIBUTARIA ct ON ct.CLTR_ID = fc.FDCL_CLTR_ID
         WHERE :data BETWEEN fc.FDCL_INICIO_VIGENCIA AND COALESCE(fc.FDCL_FIM_VIGENCIA, :data)
         ORDER BY ct.CLTR_CD`,
      )
      .all({ data });
  }

  classificacoesPorCst(cst: string, idTributo: number, data: string) {
    return (this.db as Database.Database)
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

  redutoresCompraGov(data: string) {
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

  ncmVigentes(data: string) {
    return this.db
      .prepare(
        `SELECT NCM_CD AS codigo, NCM_DESCRICAO AS descricao FROM NCM
         WHERE :data BETWEEN NCM_INICIO_VIGENCIA AND COALESCE(NCM_FIM_VIGENCIA, :data)
         ORDER BY NCM_CD`,
      )
      .all({ data });
  }

  listarNbs(data: string) {
    return this.db
      .prepare(
        `SELECT NBS_CD AS codigo, NBS_DESCRICAO AS descricao FROM NBS
         WHERE :data BETWEEN NBS_INICIO_VIGENCIA AND COALESCE(NBS_FIM_VIGENCIA, :data)
         ORDER BY NBS_CD`,
      )
      .all({ data });
  }

  nbsAplicaveisPorClassificacao(cClassTrib: string, data: string) {
    const cl = this.db
      .prepare(
        `SELECT ct.CLTR_ID AS id, ct.CLTR_NOMENCLATURA AS nomenclatura
         FROM CLASSIFICACAO_TRIBUTARIA ct
         WHERE ct.CLTR_CD = :codigo AND :data BETWEEN ct.CLTR_INICIO_VIGENCIA AND COALESCE(ct.CLTR_FIM_VIGENCIA, :data)
         LIMIT 1`,
      )
      .get({ codigo: cClassTrib, data }) as { id: number; nomenclatura: string | null } | undefined;
    if (!cl) return [];
    if (!(cl.nomenclatura ?? "").includes("NBS")) return [];
    const temVinculo = (
      this.db.prepare(`SELECT EXISTS (SELECT 1 FROM NBS_APLICAVEL WHERE NBSA_CLTR_ID = :id) AS ok`).get({ id: cl.id }) as { ok: number }
    ).ok;
    if (!temVinculo) return this.listarNbs(data);
    return this.db
      .prepare(
        `SELECT DISTINCT n.NBS_CD AS codigo, n.NBS_DESCRICAO AS descricao
         FROM NBS_APLICAVEL a JOIN NBS n ON n.NBS_CD = a.NBSA_NBS_CD
         WHERE a.NBSA_CLTR_ID = :id
           AND :data BETWEEN a.NBSA_INICIO_VIGENCIA AND COALESCE(a.NBSA_FIM_VIGENCIA, :data)
         ORDER BY n.NBS_CD`,
      )
      .all({ id: cl.id, data });
  }

  aliquotaDadosAbertos(idTributo: number, codigoUf: number | null, codigoMunicipio: number | null, data: string) {
    const row = this.db
      .prepare(
        `SELECT r.ALRE_VALOR AS ref, p.ALPA_VALOR AS padr, p.ALPA_FORMA_APLICACAO AS forma
         FROM ALIQUOTA_REFERENCIA r
         LEFT JOIN ALIQUOTA_PADRAO p ON p.ALPA_ALRE_ID = r.ALRE_ID
           AND ((:mun IS NULL AND p.ALPA_MUNI_CD IS NULL) OR (:mun IS NOT NULL AND p.ALPA_MUNI_CD = :mun))
           AND ((:uf IS NULL AND p.ALPA_UF_CD IS NULL) OR (:uf IS NOT NULL AND p.ALPA_UF_CD = :uf))
           AND p.ALPA_INICIO_VIGENCIA <= :data AND (p.ALPA_FIM_VIGENCIA IS NULL OR p.ALPA_FIM_VIGENCIA >= :data)
         WHERE r.ALRE_TBTO_ID = :id AND r.ALRE_INICIO_VIGENCIA <= :data
           AND (r.ALRE_FIM_VIGENCIA IS NULL OR r.ALRE_FIM_VIGENCIA >= :data)
         LIMIT 1`,
      )
      .get({ mun: codigoMunicipio, uf: codigoUf, data, id: idTributo }) as
      | { ref: number; padr: number | null; forma: string | null }
      | undefined;
    if (!row) return { aliquotaReferencia: null, aliquotaPropria: null, formaAplicacao: null };
    return {
      aliquotaReferencia: String(row.ref),
      aliquotaPropria: row.padr !== null ? String(row.padr) : null,
      formaAplicacao: row.forma,
    };
  }

  gruposDfe(data: string) {
    return this.db
      .prepare(
        `SELECT GRDF_ID AS id, GRDF_DESCRICAO AS descricao FROM GRUPO_DFE
         WHERE :data BETWEEN GRDF_INICIO_VIGENCIA AND COALESCE(GRDF_FIM_VIGENCIA, :data) ORDER BY GRDF_ID`,
      )
      .all({ data });
  }

  gruposAtor(data: string) {
    return this.db
      .prepare(
        `SELECT GRAT_ID AS id, GRAT_DESCRICAO AS descricao, GRAT_ORDEM AS ordem FROM GRUPO_ATOR
         WHERE :data BETWEEN GRAT_INICIO_VIGENCIA AND COALESCE(GRAT_FIM_VIGENCIA, :data) ORDER BY GRAT_ORDEM`,
      )
      .all({ data });
  }

  classificacoesAplicaveisPorNbs(nbs: string, data: string) {
    const existe = (
      this.db
        .prepare(
          `SELECT EXISTS (SELECT 1 FROM NBS WHERE NBS_CD = :nbs AND :data BETWEEN NBS_INICIO_VIGENCIA AND COALESCE(NBS_FIM_VIGENCIA, :data)) AS ok`,
        )
        .get({ nbs, data }) as { ok: number }
    ).ok;
    if (!existe) {
      const erro = new Error(`NBS de código ${nbs} não encontrada para a data ${data}`);
      erro.name = "NbsNaoEncontradaException";
      throw erro;
    }
    const vinculadas = (
      this.db
        .prepare(
          `SELECT DISTINCT ct.CLTR_CD AS codigo
           FROM NBS_APLICAVEL a JOIN CLASSIFICACAO_TRIBUTARIA ct ON ct.CLTR_ID = a.NBSA_CLTR_ID
           WHERE a.NBSA_NBS_CD = :nbs AND :data BETWEEN a.NBSA_INICIO_VIGENCIA AND COALESCE(a.NBSA_FIM_VIGENCIA, :data)
           ORDER BY ct.CLTR_CD`,
        )
        .all({ nbs, data }) as Array<{ codigo: string }>
    ).map((r) => r.codigo);
    const semVinculo = (
      this.db
        .prepare(
          `SELECT ct.CLTR_CD AS codigo FROM CLASSIFICACAO_TRIBUTARIA ct
           WHERE ct.CLTR_NOMENCLATURA LIKE '%NBS%'
             AND :data BETWEEN ct.CLTR_INICIO_VIGENCIA AND COALESCE(ct.CLTR_FIM_VIGENCIA, :data)
             AND ct.CLTR_ID NOT IN (
               SELECT n.NBSA_CLTR_ID FROM NBS_APLICAVEL n
               WHERE :data BETWEEN n.NBSA_INICIO_VIGENCIA AND COALESCE(n.NBSA_FIM_VIGENCIA, :data))
           ORDER BY ct.CLTR_CD`,
        )
        .all({ data }) as Array<{ codigo: string }>
    ).map((r) => r.codigo);
    return [...vinculadas, ...semVinculo];
  }

  detalheClassificacao(cClassTrib: string, idTributo: number, data: string) {
    const row = this.db
      .prepare(
        `SELECT ct.CLTR_ID AS id, ct.CLTR_CD AS codigo, ct.CLTR_DESCRICAO AS descricao,
                ct.CLTR_TIPO_ALIQUOTA AS tipoAliquota, ct.CLTR_NOMENCLATURA AS nomenclatura,
                tt.TRTR_DESCRICAO AS descricaoTratamento,
                tt.TRTR_IN_INCOMPATIVEL_COM_SUSPENSAO AS incompativelSuspensao,
                tt.TRTR_IN_EXIGE_GRUPO_DESONERACAO AS exigeDesoneracao,
                tt.TRTR_IN_POSSUI_PERCENTUAL_REDUCAO AS possuiReducao,
                ct.CLTR_DATA_ATUALIZACAO AS dataAtualizacao
         FROM CLASSIFICACAO_TRIBUTARIA ct
         JOIN TRATAMENTO_CLASSIFICACAO tc ON tc.TRCL_CLTR_ID = ct.CLTR_ID
         JOIN TRATAMENTO_TRIBUTARIO tt ON tt.TRTR_ID = tc.TRCL_TRTR_ID
         WHERE ct.CLTR_CD = :codigo
           AND :data BETWEEN tc.TRCL_INICIO_VIGENCIA AND COALESCE(tc.TRCL_FIM_VIGENCIA, :data)
           AND :data BETWEEN tt.TRTR_INICIO_VIGENCIA AND COALESCE(tt.TRTR_FIM_VIGENCIA, :data)
         LIMIT 1`,
      )
      .get({ codigo: cClassTrib, data }) as Record<string, unknown> | undefined;
    if (!row) return null;
    const tipos = this.db
      .prepare(
        `SELECT td.TPDF_TIPO AS tipo, td.TPDF_SIGLA AS sigla, td.TPDF_DESCRICAO AS descricao
         FROM TIPO_DFE_CLASSIFICACAO tdc JOIN TIPO_DFE td ON td.TPDF_ID = tdc.TDCL_TPDF_ID
         WHERE tdc.TDCL_CLTR_ID = :id AND :data BETWEEN tdc.TDCL_INICIO_VIGENCIA AND COALESCE(tdc.TDCL_FIM_VIGENCIA, :data)
         ORDER BY td.TPDF_TIPO`,
      )
      .all({ id: row.id, data });
    return {
      codigo: row.codigo,
      descricao: row.descricao,
      tipoAliquota: row.tipoAliquota,
      nomenclatura: row.nomenclatura,
      descricaoTratamentoTributario: row.descricaoTratamento,
      incompativelComSuspensao: Number(row.incompativelSuspensao ?? 0) !== 0,
      exigeGrupoDesoneracao: Number(row.exigeDesoneracao ?? 0) !== 0,
      possuiPercentualReducao: Number(row.possuiReducao ?? 0) !== 0,
      tiposDfeClassificacao: tipos,
      dataAtualizacao: row.dataAtualizacao ?? null,
    };
  }

  async validarNcmAplicavel(cClassTrib: string, ncm: string, data: string) {
    const cl = this.db
      .prepare(
        `SELECT ct.CLTR_ID AS id, ct.CLTR_NOMENCLATURA AS nomenclatura
         FROM CLASSIFICACAO_TRIBUTARIA ct
         WHERE ct.CLTR_CD = :codigo AND :data BETWEEN ct.CLTR_INICIO_VIGENCIA AND COALESCE(ct.CLTR_FIM_VIGENCIA, :data)
         LIMIT 1`,
      )
      .get({ codigo: cClassTrib, data }) as { id: number; nomenclatura: string | null } | undefined;
    if (!cl) return { cClassTrib, ncm, valido: false };
    const temClassificacao = (
      this.db
        .prepare(`SELECT EXISTS (SELECT 1 FROM NCM_APLICAVEL WHERE NCMA_CLTR_ID = :id AND :data BETWEEN NCMA_INICIO_VIGENCIA AND COALESCE(NCMA_FIM_VIGENCIA, :data)) AS ok`)
        .get({ id: cl.id, data }) as { ok: number }
    ).ok;
    if (!temClassificacao) return { cClassTrib, ncm, valido: true };
    const vinculado = (
      this.db
        .prepare(
          `SELECT EXISTS (SELECT 1 FROM NCM_APLICAVEL WHERE NCMA_NCM_CD = SUBSTRING(:ncm, 1, LENGTH(NCMA_NCM_CD)) AND NCMA_CLTR_ID = :id AND :data BETWEEN NCMA_INICIO_VIGENCIA AND COALESCE(NCMA_FIM_VIGENCIA, :data)) AS ok`,
        )
        .get({ ncm, id: cl.id, data }) as { ok: number }
    ).ok;
    return { cClassTrib, ncm, valido: vinculado === 1 };
  }

  tiposDfe(data: string) {
    return this.db
      .prepare(
        `SELECT TPDF_TIPO AS tipo, TPDF_SIGLA AS sigla, TPDF_DESCRICAO AS descricao
         FROM TIPO_DFE
         WHERE :data BETWEEN TPDF_INICIO_VIGENCIA AND COALESCE(TPDF_FIM_VIGENCIA, :data)
         ORDER BY TPDF_TIPO`,
      )
      .all({ data });
  }
}

export const DADOS_ABERTOS = new DadosAbertosService(process.env.RTC_DB);
