/**
 * Aba XML do resultado — gera o XML do grupo RTC para qualquer um dos 7 tipos
 * de DF-e a partir do ROC calculado e valida contra o XSD oficial.
 */
import { useState } from "react";

const TIPOS = ["nfe", "nfce", "cte", "cte-simplificado", "bpe", "bpe-tm", "nf3e"] as const;
type Tipo = (typeof TIPOS)[number];

interface Props {
  /** ROC bruto (resposta do /regime-geral) — corpo do /xml/generate */
  roc: Record<string, unknown>;
}

export function XmlPanel({ roc }: Props) {
  const [tipo, setTipo] = useState<Tipo>("nfe");
  const [xml, setXml] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [validacao, setValidacao] = useState<{ valido: boolean; erros: string[] } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const gerar = async () => {
    setCarregando(true);
    setErro(null);
    setValidacao(null);
    try {
      const res = await fetch(`/api/calculadora/xml/generate?tipo=${tipo}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(roc),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setErro((b as { detail?: string }).detail ?? `Erro ${res.status}`);
        setXml(null);
        return;
      }
      setXml(await res.text());
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  };

  const validar = async () => {
    if (!xml) return;
    setValidacao(null);
    const res = await fetch(`/api/calculadora/xml/validate?tipo=${tipo}&subtipo=grupo`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: xml,
    });
    setValidacao((await res.json()) as { valido: boolean; erros: string[] });
  };

  const copiar = async () => {
    if (!xml) return;
    await navigator.clipboard.writeText(xml);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  };

  return (
    <div className="xml-panel">
      <div className="xml-barra">
        <select value={tipo} onChange={(e) => { setTipo(e.target.value as Tipo); setXml(null); setValidacao(null); }}>
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button className="primario" onClick={gerar} disabled={carregando}>
          {carregando ? "gerando…" : "Gerar XML"}
        </button>
        {xml && (
          <>
            <button onClick={validar}>Validar (XSD)</button>
            <button onClick={copiar}>{copiado ? "copiado ✓" : "copiar"}</button>
          </>
        )}
      </div>

      {erro && <div className="problema"><p>{erro}</p></div>}

      {validacao && (
        <div className={`xml-validacao ${validacao.valido ? "ok" : "erro"}`}>
          {validacao.valido ? "✓ XML válido contra o grupo.xsd oficial" : "✗ XML inválido:"}
          {!validacao.valido && (
            <ul>
              {validacao.erros.slice(0, 4).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {xml && (
        <pre className="xml-saida">
          {xml.split("<?xml")[1] ? "<?xml" + xml.split("<?xml")[1] : xml}
        </pre>
      )}

      {!xml && !erro && (
        <p className="hint">
          Gera o XML do grupo de tributação RTC (parcial, conforme o leiaute oficial) a partir do resultado calculado
          acima. CT-e/BP-e exigem operação com exatamente 1 item. Depois valide contra o XSD da SEFAZ.
        </p>
      )}
    </div>
  );
}
