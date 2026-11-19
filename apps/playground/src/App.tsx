import { useEffect, useMemo, useState } from "react";
import { Assistente, doJson, itemVazio, paraJson, type OperacaoForm } from "./Assistente.js";
import { XmlPanel } from "./XmlPanel.js";

// ─── Tipos mínimos do ROC para renderização ─────────────────────────────────

interface ErroDetalhe {
  type: string;
  title: string;
  code: string;
  pointer: string;
  detail: string;
}

interface Objeto {
  nObj: number;
  estadoItem?: string;
  erros?: ErroDetalhe[];
  calculoSimulado?: boolean;
  tribCalc?: {
    IS?: {
      CSTIS?: string;
      cClassTribIS?: string;
      vBCIS?: string;
      pIS?: string;
      adRemIS?: string;
      uTrib?: string;
      qTrib?: string;
      vIS?: string;
      memoriaCalculo?: string;
    };
    IBSCBS?: {
      CST?: string;
      cClassTrib?: string;
      gIBSCBS?: {
        vBC?: string;
        gIBSUF?: GrupoTributo;
        gIBSMun?: GrupoTributo;
        vIBS?: string;
        gCBS?: GrupoTributo;
        gTribRegular?: Record<string, string>;
        gTribCompraGov?: Record<string, string>;
      };
      gIBSCBSMono?: Record<string, unknown> & { vTotIBSMonoItem?: string; vTotCBSMonoItem?: string };
    };
  };
}

interface GrupoTributo {
  pIBSUF?: string;
  pIBSMun?: string;
  pCBS?: string;
  vIBSUF?: string;
  vIBSMun?: string;
  vCBS?: string;
  memoriaCalculo?: string;
  gRed?: { pRedAliq?: string; pAliqEfet?: string };
  gDif?: { pDif?: string; vDif?: string };
}

interface Roc {
  oper?: { gCompraGov?: Record<string, unknown> };
  objetos?: Objeto[];
  total?: {
    tribCalc?: {
      ISTot?: { vIS: string };
      IBSCBSTot?: {
        vBCIBSCBS?: string;
        gIBS?: { vIBS?: string; gIBSUF?: { vIBSUF: string }; gIBSMun?: { vIBSMun: string } };
        gCBS?: { vCBS: string };
        gMono?: Record<string, string>;
      };
    };
  };
}

// ─── Exemplos ────────────────────────────────────────────────────────────────

const EXEMPLOS: Record<string, unknown> = {
  "Operação simples (mercadoria, 2026)": {
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
  },
  "Serviço com NBS + Imposto Seletivo (2027, alíquotas nominais)": {
    id: "6194602ea71cbf9431c236de4409d920",
    versao: "0.0.1",
    dhFatoGerador: "2027-03-10T09:50:05-03:00",
    municipio: 4314902,
    uf: "RS",
    itens: [
      {
        numero: 1,
        nbs: "109052100",
        cst: "000",
        cClassTrib: "000001",
        baseCalculo: 1000,
        quantidade: 1,
        unidade: "UN",
        aliquotasNominais: { cbs: 8.8, ibsEstadual: 5.0, ibsMunicipal: 5.0 },
      },
    ],
  },
  "Compra governamental — União (2027)": {
    id: "6194602ea71cbf9431c236de4409d920",
    versao: "0.0.1",
    dhFatoGerador: "2027-01-01T09:50:05-03:00",
    municipio: 4314902,
    uf: "RS",
    gCompraGov: { tpEnteGov: 1, tpOperGov: 1 },
    itens: [
      {
        numero: 1,
        ncm: "10063011",
        cst: "000",
        cClassTrib: "000001",
        baseCalculo: 200,
        quantidade: 1,
        unidade: "LT",
        aliquotasNominais: { cbs: 8.4, ibsEstadual: 0.05, ibsMunicipal: 0.05 },
      },
    ],
  },
  "Com erro (NCM inexistente) — teste a observabilidade": {
    id: "6194602ea71cbf9431c236de4409d920",
    versao: "0.0.1",
    dhFatoGerador: "2026-06-01T09:50:05-03:00",
    municipio: 4314902,
    uf: "RS",
    itens: [
      { numero: 1, ncm: "09024000", cst: "000", cClassTrib: "000001", baseCalculo: 200, quantidade: 1, unidade: "UN" },
      { numero: 2, ncm: "00000000", cst: "000", cClassTrib: "000001", baseCalculo: 100, quantidade: 1, unidade: "UN" },
    ],
  },
};

// ─── Componentes ─────────────────────────────────────────────────────────────

function Moeda({ rotulo, valor }: { rotulo: string; valor?: string }) {
  if (valor === undefined || valor === null) return null;
  return (
    <div className="campo">
      <span className="campo-rotulo">{rotulo}</span>
      <span className="campo-valor">R$ {valor}</span>
    </div>
  );
}

function Aliquota({ rotulo, valor }: { rotulo: string; valor?: string }) {
  if (valor === undefined || valor === null) return null;
  return (
    <div className="campo">
      <span className="campo-rotulo">{rotulo}</span>
      <span className="campo-valor aliq">{valor}%</span>
    </div>
  );
}

function CartaoTributo({ titulo, grupo, cor }: { titulo: string; grupo?: GrupoTributo; cor: string }) {
  if (!grupo) return null;
  const valor = grupo.vCBS ?? grupo.vIBSUF ?? grupo.vIBSMun;
  const aliquota = grupo.pCBS ?? grupo.pIBSUF ?? grupo.pIBSMun;
  return (
    <div className={`cartao-tributo ${cor}`}>
      <div className="cartao-titulo">{titulo}</div>
      <div className="cartao-corpo">
        <Moeda rotulo="Valor devido" valor={valor} />
        <Aliquota rotulo="Alíquota" valor={aliquota} />
        {grupo.gRed && (
          <>
            <Aliquota rotulo="Redução" valor={grupo.gRed.pRedAliq} />
            <Aliquota rotulo="Alíq. efetiva" valor={grupo.gRed.pAliqEfet} />
          </>
        )}
        {grupo.gDif && (
          <>
            <Aliquota rotulo="% Diferido" valor={grupo.gDif.pDif} />
            <Moeda rotulo="Diferido" valor={grupo.gDif.vDif} />
          </>
        )}
      </div>
      {grupo.memoriaCalculo && <div className="memoria">{grupo.memoriaCalculo}</div>}
    </div>
  );
}

function ItemCard({ obj }: { obj: Objeto }) {
  const is = obj.tribCalc?.IS;
  const ibs = obj.tribCalc?.IBSCBS;
  const g = ibs?.gIBSCBS;
  return (
    <div className={`item-card ${obj.estadoItem === "CALCULADO" || obj.estadoItem === undefined ? "ok" : "erro"}`}>
      <div className="item-cabecalho">
        <span className="item-numero">Item {obj.nObj}</span>
        {obj.estadoItem && <span className="badge estado">{obj.estadoItem}</span>}
        {obj.calculoSimulado && <span className="badge simulado">cálculo simulado</span>}
        {ibs && (
          <span className="badge classe">
            CST {ibs.CST} · cClassTrib {ibs.cClassTrib}
          </span>
        )}
      </div>

      {obj.erros && obj.erros.length > 0 && (
        <div className="erros">
          {obj.erros.map((e, i) => (
            <div key={i} className="erro-linha">
              <span className="badge codigo">{e.code}</span>
              <span className="erro-campo">{e.pointer}</span>
              <span className="erro-detail">{e.detail}</span>
            </div>
          ))}
        </div>
      )}

      {is && (
        <div className="bloco">
          <div className="bloco-titulo">Imposto Seletivo</div>
          <div className="linha-dados">
            <Moeda rotulo="Base de cálculo" valor={is.vBCIS} />
            <Moeda rotulo="Valor do IS" valor={is.vIS} />
            <Aliquota rotulo="Alíquota ad valorem" valor={is.pIS} />
            <Aliquota rotulo="Alíquota ad rem" valor={is.adRemIS} />
          </div>
          {is.memoriaCalculo && <div className="memoria">{is.memoriaCalculo}</div>}
        </div>
      )}

      {g && (
        <div className="tributos-grid">
          <div className="bloco-base">
            <Moeda rotulo="Base de cálculo (CBS/IBS)" valor={g.vBC} />
            <Moeda rotulo="IBS total" valor={g.vIBS} />
          </div>
          <CartaoTributo titulo="CBS" grupo={g.gCBS} cor="cbs" />
          <CartaoTributo titulo="IBS — UF" grupo={g.gIBSUF} cor="ibsuf" />
          <CartaoTributo titulo="IBS — Município" grupo={g.gIBSMun} cor="ibsmun" />
        </div>
      )}

      {g?.gTribRegular && (
        <div className="bloco">
          <div className="bloco-titulo">Tributação regular (desoneração/suspensão)</div>
          <div className="linha-dados">
            <Aliquota rotulo="Alíq. efet. CBS" valor={g.gTribRegular.pAliqEfetRegCBS} />
            <Moeda rotulo="Valor CBS" valor={g.gTribRegular.vTribRegCBS} />
            <Aliquota rotulo="Alíq. efet. IBS-UF" valor={g.gTribRegular.pAliqEfetRegIBSUF} />
            <Moeda rotulo="Valor IBS-UF" valor={g.gTribRegular.vTribRegIBSUF} />
            <Aliquota rotulo="Alíq. efet. IBS-Mun" valor={g.gTribRegular.pAliqEfetRegIBSMun} />
            <Moeda rotulo="Valor IBS-Mun" valor={g.gTribRegular.vTribRegIBSMun} />
          </div>
        </div>
      )}

      {g?.gTribCompraGov && (
        <div className="bloco">
          <div className="bloco-titulo">Compra governamental</div>
          <div className="linha-dados">
            <Aliquota rotulo="Alíq. CBS" valor={g.gTribCompraGov.pAliqCBS} />
            <Moeda rotulo="Valor CBS" valor={g.gTribCompraGov.vTribCBS} />
            <Aliquota rotulo="Alíq. IBS-UF" valor={g.gTribCompraGov.pAliqIBSUF} />
            <Moeda rotulo="Valor IBS-UF" valor={g.gTribCompraGov.vTribIBSUF} />
            <Aliquota rotulo="Alíq. IBS-Mun" valor={g.gTribCompraGov.pAliqIBSMun} />
            <Moeda rotulo="Valor IBS-Mun" valor={g.gTribCompraGov.vTribIBSMun} />
          </div>
        </div>
      )}

      {ibs?.gIBSCBSMono && (
        <div className="bloco">
          <div className="bloco-titulo">Monofasia</div>
          <div className="linha-dados">
            <Moeda rotulo="Total IBS monofásico" valor={ibs.gIBSCBSMono.vTotIBSMonoItem as string} />
            <Moeda rotulo="Total CBS monofásica" valor={ibs.gIBSCBSMono.vTotCBSMonoItem as string} />
          </div>
          <details>
            <summary>Detalhes da monofasia</summary>
            <pre>{JSON.stringify(ibs.gIBSCBSMono, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────

const FORM_INICIAL: OperacaoForm = {
  dhFatoGerador: "2026-06-01T09:50",
  uf: "RS",
  municipio: 4314902,
  municipioLabel: "Porto Alegre",
  tpDoc: "",
  gCompraGov: false,
  tpEnteGov: "1",
  tpOperGov: "1",
  itens: [itemVazio(1)],
};

export function App() {
  const [modoEntrada, setModoEntrada] = useState<"assistente" | "json">("json");
  const [form, setForm] = useState<OperacaoForm>(FORM_INICIAL);
  const [texto, setTexto] = useState(JSON.stringify(EXEMPLOS["Operação simples (mercadoria, 2026)"], null, 2));
  const [modo, setModo] = useState<"regime-geral" | "observabilidade">("regime-geral");
  const [abaResultado, setAbaResultado] = useState<"visao" | "json" | "xml">("visao");
  const [roc, setRoc] = useState<Roc | null>(null);
  const [erro, setErro] = useState<{ status: number; titulo: string; detail: string; codigo?: string; errors?: ErroDetalhe[] } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [verJson, setVerJson] = useState(false);
  const [versao, setVersao] = useState<string>("");

  useEffect(() => {
    fetch("/api/calculadora/versao")
      .then((r) => r.json())
      .then((v) => setVersao(`${v.versao} (${String(v.data).slice(0, 10)})`))
      .catch(() => setVersao("indisponível"));
  }, []);

  const [rocBruto, setRocBruto] = useState<Record<string, unknown> | null>(null);

  const jsonValido = useMemo(() => {
    if (modoEntrada === "assistente") return !!form.municipio && form.itens.length > 0;
    try {
      JSON.parse(texto);
      return true;
    } catch {
      return false;
    }
  }, [texto, modoEntrada, form]);

  /** alterna assistente ↔ json carregando o conteúdo de um no outro */
  function alternarEntrada(destino: "assistente" | "json") {
    if (destino === "json" && modoEntrada === "assistente") {
      try {
        setTexto(JSON.stringify(paraJson(form), null, 2));
      } catch {
        /* mantém texto atual */
      }
    } else if (destino === "assistente" && modoEntrada === "json") {
      try {
        setForm(doJson(JSON.parse(texto)));
      } catch {
        /* mantém form atual */
      }
    }
    setModoEntrada(destino);
  }

  async function calcular() {
    setCarregando(true);
    setErro(null);
    setRoc(null);
    setRocBruto(null);
    setAbaResultado("visao");
    const corpo = modoEntrada === "assistente" ? JSON.stringify(paraJson(form)) : texto;
    try {
      const endpoint =
        modo === "observabilidade" ? "/api/calculadora/observabilidade/regime-geral" : "/api/calculadora/regime-geral";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: corpo,
      });
      const body = await res.json();
      if (!res.ok) {
        setErro({
          status: res.status,
          titulo: body.title ?? "Erro",
          detail: body.detail ?? JSON.stringify(body),
          codigo: body.codigo,
          errors: body.errors,
        });
      } else {
        setRoc(body as Roc);
        setRocBruto(body as Record<string, unknown>);
      }
    } catch (e) {
      setErro({ status: 0, titulo: "Falha de rede", detail: (e as Error).message, codigo: undefined, errors: undefined });
    } finally {
      setCarregando(false);
    }
  }

  const tot = roc?.total?.tribCalc;

  return (
    <div className="app">
      <header>
        <div>
          <h1>Calculadora de Tributos — RTC</h1>
          <p className="subtitulo">
            CBS · IBS · Imposto Seletivo — Reforma Tributária do Consumo (LC 214/2025) ·{" "}
            <span className="versao">base {versao}</span>
          </p>
        </div>
        <div className="aviso">
          Alíquotas de 2026 são <strong>dados de referência</strong> (ainda não definidas em lei) — reproduz a base
          oficial da API da Receita Federal.
        </div>
      </header>

      <main>
        <section className="painel entrada">
          <div className="painel-barra">
            <h2>Operação</h2>
            <div className="modos">
              <button className={modoEntrada === "assistente" ? "ativo" : ""} onClick={() => alternarEntrada("assistente")}>
                Assistente
              </button>
              <button className={modoEntrada === "json" ? "ativo" : ""} onClick={() => alternarEntrada("json")}>
                JSON
              </button>
            </div>
            <select
              hidden={modoEntrada === "assistente"}
              onChange={(e) => {
                setTexto(JSON.stringify(EXEMPLOS[e.target.value], null, 2));
                setModoEntrada("json");
              }}
              defaultValue=""
            >
              <option value="" disabled>
                Carregar exemplo…
              </option>
              {Object.keys(EXEMPLOS).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          {modoEntrada === "assistente" ? (
            <Assistente form={form} setForm={setForm} />
          ) : (
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              spellCheck={false}
              className={jsonValido ? "" : "invalido"}
            />
          )}
          <div className="acoes">
            <div className="modos">
              <button className={modo === "regime-geral" ? "ativo" : ""} onClick={() => setModo("regime-geral")}>
                Fail-fast
              </button>
              <button
                className={modo === "observabilidade" ? "ativo" : ""}
                onClick={() => setModo("observabilidade")}
              >
                Observabilidade
              </button>
            </div>
            <button className="primario" disabled={!jsonValido || carregando} onClick={calcular}>
              {carregando ? "Calculando…" : "Calcular tributos"}
            </button>
          </div>
          {!jsonValido && <p className="hint">⚠︎ JSON inválido</p>}
        </section>

        <section className="painel saida">
          <div className="painel-barra">
            <h2>Resultado</h2>
            {roc && (
              <div className="modos">
                <button className={abaResultado === "visao" ? "ativo" : ""} onClick={() => setAbaResultado("visao")}>
                  Visão
                </button>
                <button className={abaResultado === "json" ? "ativo" : ""} onClick={() => setAbaResultado("json")}>
                  JSON
                </button>
                <button className={abaResultado === "xml" ? "ativo" : ""} onClick={() => setAbaResultado("xml")} disabled={modo === "observabilidade"}>
                  XML
                </button>
              </div>
            )}
          </div>

          {erro && (
            <div className="problema">
              <div className="problema-cabeca">
                <span className="badge codigo">{erro.codigo ?? erro.status}</span>
                <strong>{erro.titulo}</strong>
              </div>
              <p>{erro.detail}</p>
              {erro.errors && (
                <div className="erros">
                  {erro.errors.map((e, i) => (
                    <div key={i} className="erro-linha">
                      <span className="badge codigo">{e.code}</span>
                      <span className="erro-campo">{e.pointer}</span>
                      <span className="erro-detail">{e.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {roc && abaResultado === "json" && <pre className="json">{JSON.stringify(roc, null, 2)}</pre>}

          {roc && abaResultado === "xml" && rocBruto && <XmlPanel roc={rocBruto} />}

          {roc && abaResultado === "visao" && (
            <>
              {tot?.ISTot && (
                <div className="faixa-total">
                  <div>
                    <span className="campo-rotulo">Total Imposto Seletivo</span>
                    <span className="total-valor">R$ {tot.ISTot.vIS}</span>
                  </div>
                  {tot.IBSCBSTot && (
                    <>
                      <div>
                        <span className="campo-rotulo">Base total (CBS/IBS)</span>
                        <span className="total-valor">R$ {tot.IBSCBSTot.vBCIBSCBS}</span>
                      </div>
                      <div>
                        <span className="campo-rotulo">Total CBS</span>
                        <span className="total-valor">R$ {tot.IBSCBSTot.gCBS?.vCBS}</span>
                      </div>
                      <div>
                        <span className="campo-rotulo">Total IBS</span>
                        <span className="total-valor">R$ {tot.IBSCBSTot.gIBS?.vIBS}</span>
                      </div>
                    </>
                  )}
                </div>
              )}
              {(roc.objetos ?? []).map((o) => (
                <ItemCard key={o.nObj} obj={o} />
              ))}
            </>
          )}

          {!roc && !erro && (
            <div className="vazio">
              <p>
                Cole uma operação JSON à esquerda (ou carregue um exemplo) e clique em <strong>Calcular</strong>.
              </p>
              <p className="hint">
                O modo <strong>Observabilidade</strong> processa todos os itens e reporta erros individuais (REG/CAL);
                o fail-fast para no primeiro erro.
              </p>
            </div>
          )}
        </section>
      </main>

      <footer>
        Porte TypeScript com paridade estrita da API oficial · dados e XSDs do projeto{" "}
        <a href="https://github.com/ReceitaFederal/calculadora-rtc-regime-regular" target="_blank" rel="noreferrer">
          ReceitaFederal/calculadora-rtc-regime-regular
        </a>{" "}
        (MIT)
      </footer>
    </div>
  );
}
