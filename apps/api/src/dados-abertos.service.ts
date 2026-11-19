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
