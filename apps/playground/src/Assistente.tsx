/**
 * Assistente — formulário guiado com autocompletes alimentados pelos dados
 * abertos da própria API (NCM/NBS, cClassTrib, CST, UFs e municípios).
 * Monta o mesmo JSON do modo avançado e dispara o mesmo cálculo.
 */
import { useEffect, useMemo, useState } from "react";
import { AutoComplete, type Opcao } from "./AutoComplete.js";

const API = "/api/calculadora";

export interface ItemForm {
  nomenclatura: "ncm" | "nbs";
  codigo: string;
  codigoLabel: string;
  cst: string;
  cstLabel: string;
  cClassTrib: string;
  cClassTribLabel: string;
  baseCalculo: string;
  quantidade: string;
  unidade: string;
  abreIS: boolean;
  isCst: string;
  isCClassTrib: string;
  isBase: string;
  isQuantidade: string;
  isUnidade: string;
  isImpostoInformado: string;
  abreAliquotas: boolean;
  aCbs: string;
  aIbsUf: string;
  aIbsMun: string;
  tributacaoRegularCst: string;
  tributacaoRegularCClass: string;
}

export interface OperacaoForm {
  dhFatoGerador: string;
  uf: string;
  municipio: number | null;
  municipioLabel: string;
  tpDoc: string;
  gCompraGov: boolean;
  tpEnteGov: string;
  tpOperGov: string;
  itens: ItemForm[];
}

export function itemVazio(numero: number): ItemForm {
  return {
    nomenclatura: "ncm",
    codigo: "",
    codigoLabel: "",
    cst: "",
    cstLabel: "",
    cClassTrib: "",
    cClassTribLabel: "",
    baseCalculo: "",
    quantidade: "1",
    unidade: "UN",
    abreIS: false,
    isCst: "",
    isCClassTrib: "",
    isBase: "",
    isQuantidade: "",
    isUnidade: "",
    isImpostoInformado: "",
    abreAliquotas: false,
    aCbs: "",
    aIbsUf: "",
    aIbsMun: "",
    tributacaoRegularCst: "",
    tributacaoRegularCClass: "",
  };
}

const num = (v: string): number | undefined => (v.trim() === "" ? undefined : Number(v));
const numOuNull = (v: string): number | null => (v.trim() === "" ? null : Number(v));

/** Form → JSON da operação (mesmo contrato do POST /regime-geral). */
export function paraJson(op: OperacaoForm): Record<string, unknown> {
  const ano = Number((op.dhFatoGerador || "2026").slice(0, 4));
  return {
    id: "playground-" + Date.now().toString(16),
    versao: "0.0.1",
    dhFatoGerador: op.dhFatoGerador + (op.dhFatoGerador.length === 16 ? ":00" : "") + ":00-03:00",
    municipio: op.municipio,
    uf: op.uf,
    ...(op.tpDoc ? { tpDoc: Number(op.tpDoc) } : {}),
    ...(op.gCompraGov ? { gCompraGov: { tpEnteGov: Number(op.tpEnteGov), tpOperGov: Number(op.tpOperGov) } } : {}),
    itens: op.itens.map((it, i) => ({
      numero: i + 1,
      ...(it.codigo ? { [it.nomenclatura]: it.codigo } : {}),
      cst: it.cst,
      cClassTrib: it.cClassTrib,
      ...(it.baseCalculo ? { baseCalculo: Number(it.baseCalculo) } : {}),
      ...(it.quantidade ? { quantidade: Number(it.quantidade) } : {}),
      ...(it.unidade ? { unidade: it.unidade } : {}),
      ...(it.isCst || it.isCClassTrib || it.isBase
        ? {
            impostoSeletivo: {
              ...(it.isCst ? { cst: it.isCst } : {}),
              ...(it.isCClassTrib ? { cClassTrib: it.isCClassTrib } : {}),
              ...(it.isBase ? { baseCalculo: Number(it.isBase) } : {}),
              ...(it.isQuantidade ? { quantidade: Number(it.isQuantidade) } : {}),
              ...(it.isUnidade ? { unidade: it.isUnidade } : {}),
              ...(it.isImpostoInformado ? { impostoInformado: Number(it.isImpostoInformado) } : {}),
            },
          }
        : {}),
      ...(it.tributacaoRegularCClass ? { tributacaoRegular: { ...(it.tributacaoRegularCst ? { cst: it.tributacaoRegularCst } : {}), cClassTrib: it.tributacaoRegularCClass } } : {}),
      ...(ano >= 2027 && (it.aCbs || it.aIbsUf || it.aIbsMun)
        ? {
            aliquotasNominais: {
              ...(it.aCbs ? { cbs: Number(it.aCbs) } : {}),
              ...(it.aIbsUf ? { ibsEstadual: Number(it.aIbsUf) } : {}),
              ...(it.aIbsMun ? { ibsMunicipal: Number(it.aIbsMun) } : {}),
            },
          }
        : {}),
    })),
  };
}

/** JSON → Form (melhor esforço; campos desconhecidos são ignorados). */
export function doJson(json: Record<string, unknown>): OperacaoForm {
  const dh = String(json.dhFatoGerador ?? json.dataHoraEmissao ?? new Date().toISOString().slice(0, 16));
  const itensJson = (json.itens as Array<Record<string, unknown>>) ?? [];
  return {
    dhFatoGerador: dh.slice(0, 16),
    uf: String(json.uf ?? ""),
    municipio: numOuNull(String(json.municipio ?? "")),
    municipioLabel: String(json.municipio ?? ""),
    tpDoc: json.tpDoc ? String(json.tpDoc) : "",
    gCompraGov: !!json.gCompraGov,
    tpEnteGov: json.gCompraGov ? String((json.gCompraGov as Record<string, unknown>).tpEnteGov ?? "1") : "1",
    tpOperGov: json.gCompraGov ? String((json.gCompraGov as Record<string, unknown>).tpOperGov ?? "1") : "1",
    itens: itensJson.map((it) => {
      const is = (it.impostoSeletivo as Record<string, unknown>) ?? {};
      const tr = (it.tributacaoRegular as Record<string, unknown>) ?? {};
      const an = (it.aliquotasNominais as Record<string, unknown>) ?? {};
      return {
        nomenclatura: it.nbs ? "nbs" : "ncm",
        codigo: String(it.ncm ?? it.nbs ?? ""),
        codigoLabel: String(it.ncm ?? it.nbs ?? ""),
        cst: String(it.cst ?? ""),
        cstLabel: String(it.cst ?? ""),
        cClassTrib: String(it.cClassTrib ?? ""),
        cClassTribLabel: String(it.cClassTrib ?? ""),
        baseCalculo: it.baseCalculo ? String(it.baseCalculo) : "",
        quantidade: it.quantidade ? String(it.quantidade) : "1",
        unidade: String(it.unidade ?? "UN"),
        abreIS: !!it.impostoSeletivo,
        isCst: String(is.cst ?? ""),
        isCClassTrib: String(is.cClassTrib ?? ""),
        isBase: is.baseCalculo ? String(is.baseCalculo) : "",
        isQuantidade: is.quantidade ? String(is.quantidade) : "",
        isUnidade: String(is.unidade ?? ""),
        isImpostoInformado: is.impostoInformado ? String(is.impostoInformado) : "",
        abreAliquotas: !!it.aliquotasNominais,
        aCbs: an.cbs ? String(an.cbs) : "",
        aIbsUf: an.ibsEstadual ? String(an.ibsEstadual) : "",
        aIbsMun: an.ibsMunicipal ? String(an.ibsMunicipal) : "",
        tributacaoRegularCst: String(tr.cst ?? ""),
        tributacaoRegularCClass: String(tr.cClassTrib ?? ""),
      };
    }),
  };
}

// ─── Fetchers dos dados abertos ──────────────────────────────────────────────

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) return [] as T;
  return (await res.json()) as T;
}

const buscarNcm = async (busca: string): Promise<Opcao[]> => {
  const ehCodigo = /^\d+$/.test(busca.trim());
  const param = ehCodigo ? `prefixo=${encodeURIComponent(busca.trim())}` : `q=${encodeURIComponent(busca.trim())}`;
  const r = await getJson<{ itens: Array<{ codigo: string; descricao: string }> }>(
    `${API}/dados-abertos/ncm?${param}&limite=12`,
  );
  return (r.itens ?? []).map((n) => ({ value: n.codigo, label: n.descricao }));
};

const buscarNbs = async (busca: string): Promise<Opcao[]> => {
  const ehCodigo = /^\d+$/.test(busca.trim());
  const param = ehCodigo ? `prefixo=${encodeURIComponent(busca.trim())}` : `q=${encodeURIComponent(busca.trim())}`;
  const r = await getJson<{ itens: Array<{ codigo: string; descricao: string }> }>(
    `${API}/dados-abertos/nbs?${param}&limite=12`,
  );
  return (r.itens ?? []).map((n) => ({ value: n.codigo, label: n.descricao }));
};

const buscarCclass = async (q: string): Promise<Opcao[]> => {
  const r = await getJson<Array<{ codigo: string; descricao: string; cst?: string }>>(
    `${API}/dados-abertos/classificacoes-tributarias?data=${hoje()}`,
  );
  const ql = q.toLowerCase();
  return r
    .filter((c) => c.codigo.includes(q) || c.descricao.toLowerCase().includes(ql))
    .slice(0, 12)
    .map((c) => ({ value: c.codigo, label: c.descricao, hint: `CST ${c.cst ?? ""}` }));
};

const listarCst = async (): Promise<Opcao[]> => {
  const r = await getJson<Array<{ codigo: string; descricao: string }>>(
    `${API}/dados-abertos/situacoes-tributarias/cbs-ibs?data=${hoje()}`,
  );
  return r.map((c) => ({ value: c.codigo, label: c.descricao }));
};

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Componente ──────────────────────────────────────────────────────────────

interface Props {
  form: OperacaoForm;
  setForm: (f: OperacaoForm) => void;
}

export function Assistente({ form, setForm }: Props) {
  const [ufs, setUfs] = useState<Array<{ sigla: string; nome: string }>>([]);
  const [csts, setCsts] = useState<Opcao[]>([]);
  const ano = useMemo(() => Number((form.dhFatoGerador || "2026").slice(0, 4)), [form.dhFatoGerador]);

  useEffect(() => {
    void getJson<Array<{ sigla: string; nome: string }>>(`${API}/dados-abertos/ufs`).then(setUfs);
    void listarCst().then(setCsts);
  }, []);

  const setItem = (idx: number, patch: Partial<ItemForm>) => {
    const itens = form.itens.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    setForm({ ...form, itens });
  };

  const buscarMunicipios = async (q: string): Promise<Opcao[]> => {
    if (!form.uf) return [];
    const r = await getJson<Array<{ codigo: number; nome: string }>>(
      `${API}/dados-abertos/municipios?uf=${form.uf}`,
    );
    const ql = q.toLowerCase();
    return r
      .filter((m) => m.nome.toLowerCase().includes(ql) || String(m.codigo).startsWith(q))
      .slice(0, 12)
      .map((m) => ({ value: String(m.codigo), label: m.nome }));
  };

  return (
    <div className="assistente">
      <div className="linha-form">
        <label>
          Fato gerador
          <input
            type="datetime-local"
            value={form.dhFatoGerador}
            onChange={(e) => setForm({ ...form, dhFatoGerador: e.target.value })}
          />
        </label>
        <label>
          UF
          <select value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value, municipio: null, municipioLabel: "" })}>
            <option value="">—</option>
            {ufs.map((u) => (
              <option key={u.sigla} value={u.sigla}>
                {u.sigla}
              </option>
            ))}
          </select>
        </label>
        <label className="campo-longo">
          Município {form.uf ? "" : "(escolha a UF)"}
          <AutoComplete
            placeholder={form.uf ? "buscar por nome ou código…" : "—"}
            valor={form.municipioLabel}
            buscar={buscarMunicipios}
            onSelect={(op) =>
              setForm({
                ...form,
                municipio: op ? Number(op.value) : null,
                municipioLabel: op ? op.label : "",
              })
            }
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={form.gCompraGov} onChange={(e) => setForm({ ...form, gCompraGov: e.target.checked })} />
          Compra governamental
        </label>
        {form.gCompraGov && (
          <>
            <label>
              Ente
              <select value={form.tpEnteGov} onChange={(e) => setForm({ ...form, tpEnteGov: e.target.value })}>
                <option value="1">União</option>
                <option value="2">Estado</option>
                <option value="3">Distrito Federal</option>
                <option value="4">Município</option>
                <option value="5">Consórcio Público</option>
                <option value="6">Comitê Gestor do IBS</option>
              </select>
            </label>
            <label>
              Operação
              <select value={form.tpOperGov} onChange={(e) => setForm({ ...form, tpOperGov: e.target.value })}>
                <option value="1">Fornecimento c/ pagamento posterior</option>
                <option value="2">Recebimento (fornecimento já realizado)</option>
                <option value="3">Fornecimento c/ pagamento realizado</option>
                <option value="4">Recebimento (pagamento posterior)</option>
                <option value="5">Fornecimento e recebimento concomitantes</option>
              </select>
            </label>
          </>
        )}
      </div>

      {form.itens.map((it, idx) => (
        <fieldset key={idx} className="item-form">
          <legend>
            Item {idx + 1}
            <button className="mini" onClick={() => setForm({ ...form, itens: form.itens.filter((_, i) => i !== idx) })}>
              remover
            </button>
          </legend>
          <div className="linha-form">
            <label className="radio-group">
              <span
                role="button"
                className={it.nomenclatura === "ncm" ? "ativo" : ""}
                onClick={() => setItem(idx, { nomenclatura: "ncm", codigo: "", codigoLabel: "" })}
              >
                NCM
              </span>
              <span
                role="button"
                className={it.nomenclatura === "nbs" ? "ativo" : ""}
                onClick={() => setItem(idx, { nomenclatura: "nbs", codigo: "", codigoLabel: "" })}
              >
                NBS
              </span>
            </label>
            <label className="campo-longo">
              {it.nomenclatura === "ncm" ? "NCM" : "NBS"} (código ou descrição)
              <AutoComplete
                placeholder="ex.: 2203 ou cerveja…"
                valor={it.codigoLabel}
                buscar={it.nomenclatura === "ncm" ? buscarNcm : buscarNbs}
                onSelect={(op) =>
                  setItem(idx, op ? { codigo: op.value, codigoLabel: `${op.value} — ${op.label}` } : { codigo: "", codigoLabel: "" })
                }
              />
            </label>
            <label>
              CST (CBS/IBS)
              <select value={it.cst} onChange={(e) => setItem(idx, { cst: e.target.value })}>
                <option value="">—</option>
                {csts.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.value} — {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo-longo">
              cClassTrib
              <AutoComplete
                placeholder="ex.: 000001 ou 'tributação integral'…"
                valor={it.cClassTribLabel}
                buscar={buscarCclass}
                onSelect={(op) =>
                  setItem(idx, op ? { cClassTrib: op.value, cClassTribLabel: `${op.value} — ${op.label}`, cst: it.cst || (op.hint?.replace("CST ", "") ?? it.cst) } : { cClassTrib: "", cClassTribLabel: "" })
                }
              />
            </label>
          </div>
          <div className="linha-form">
            <label>
              Base de cálculo
              <input inputMode="decimal" value={it.baseCalculo} onChange={(e) => setItem(idx, { baseCalculo: e.target.value })} placeholder="200.00" />
            </label>
            <label>
              Quantidade
              <input inputMode="decimal" value={it.quantidade} onChange={(e) => setItem(idx, { quantidade: e.target.value })} />
            </label>
            <label>
              Unidade
              <input value={it.unidade} onChange={(e) => setItem(idx, { unidade: e.target.value })} />
            </label>
            <label className="check">
              <input type="checkbox" checked={it.abreIS} onChange={(e) => setItem(idx, { abreIS: e.target.checked })} />
              Imposto Seletivo
            </label>
            <label className="check">
              <input type="checkbox" checked={it.abreAliquotas} onChange={(e) => setItem(idx, { abreAliquotas: e.target.checked })} />
              Alíquotas nominais {ano >= 2027 ? "(obrigatórias)" : "(só a partir de 2027)"}
            </label>
          </div>
          {it.abreIS && (
            <div className="linha-form subgrupo">
              <label>
                CST (IS)
                <input value={it.isCst} onChange={(e) => setItem(idx, { isCst: e.target.value })} placeholder="000" />
              </label>
              <label>
                cClassTrib (IS)
                <input value={it.isCClassTrib} onChange={(e) => setItem(idx, { isCClassTrib: e.target.value })} placeholder="000001" />
              </label>
              <label>
                Base (IS)
                <input inputMode="decimal" value={it.isBase} onChange={(e) => setItem(idx, { isBase: e.target.value })} placeholder="150.00" />
              </label>
              <label>
                Qtd (IS)
                <input inputMode="decimal" value={it.isQuantidade} onChange={(e) => setItem(idx, { isQuantidade: e.target.value })} />
              </label>
              <label>
                Unid. (IS)
                <input value={it.isUnidade} onChange={(e) => setItem(idx, { isUnidade: e.target.value })} placeholder="LT" />
              </label>
              <label>
                IS informado
                <input inputMode="decimal" value={it.isImpostoInformado} onChange={(e) => setItem(idx, { isImpostoInformado: e.target.value })} placeholder="15.00" />
              </label>
            </div>
          )}
          {it.abreAliquotas && (
            <div className="linha-form subgrupo">
              <label>
                CBS %
                <input inputMode="decimal" value={it.aCbs} onChange={(e) => setItem(idx, { aCbs: e.target.value })} placeholder="8.8" />
              </label>
              <label>
                IBS-UF %
                <input inputMode="decimal" value={it.aIbsUf} onChange={(e) => setItem(idx, { aIbsUf: e.target.value })} placeholder="5.0" />
              </label>
              <label>
                IBS-Mun %
                <input inputMode="decimal" value={it.aIbsMun} onChange={(e) => setItem(idx, { aIbsMun: e.target.value })} placeholder="5.0" />
              </label>
            </div>
          )}
          <details className="avancado-item">
            <summary>Desoneração/suspensão (tributação regular)</summary>
            <div className="linha-form subgrupo">
              <label>
                CST regular
                <input value={it.tributacaoRegularCst} onChange={(e) => setItem(idx, { tributacaoRegularCst: e.target.value })} />
              </label>
              <label>
                cClassTrib regular
                <input value={it.tributacaoRegularCClass} onChange={(e) => setItem(idx, { tributacaoRegularCClass: e.target.value })} />
              </label>
            </div>
          </details>
        </fieldset>
      ))}

      <button className="adicionar-item" onClick={() => setForm({ ...form, itens: [...form.itens, itemVazio(form.itens.length + 1)] })}>
        + adicionar item
      </button>
    </div>
  );
}
