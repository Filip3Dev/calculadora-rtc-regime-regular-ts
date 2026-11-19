import { useEffect, useMemo, useRef, useState } from "react";

export interface Opcao {
  value: string;
  label: string;
  hint?: string;
}

interface Props {
  placeholder: string;
  valor: string;
  onSelect: (opcao: Opcao | null) => void;
  buscar: (query: string) => Promise<Opcao[]>;
  /** quando vazio, lista opções iniciais (ex.: catálogo completo) */
  iniciais?: () => Promise<Opcao[]>;
  autoFocus?: boolean;
}

/** Input com busca remota (debounce 250ms), setas + Enter e limpeza. */
export function AutoComplete({ placeholder, valor, onSelect, buscar, iniciais, autoFocus }: Props) {
  const [texto, setTexto] = useState(valor);
  const [opcoes, setOpcoes] = useState<Opcao[]>([]);
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const reqId = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => setTexto(valor), [valor]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const consultar = useMemo(
    () => async (q: string) => {
      const id = ++reqId.current;
      setCarregando(true);
      try {
        const lista = q.length === 0 && iniciais ? await iniciais() : await buscar(q);
        if (id === reqId.current) {
          setOpcoes(lista.slice(0, 12));
          setDestaque(0);
        }
      } finally {
        if (id === reqId.current) setCarregando(false);
      }
    },
    [buscar, iniciais],
  );

  useEffect(() => {
    if (!aberto) return;
    const t = setTimeout(() => void consultar(texto.trim()), texto ? 250 : 0);
    return () => clearTimeout(t);
  }, [texto, aberto, consultar]);

  const escolher = (op: Opcao) => {
    setTexto(op.label);
    setAberto(false);
    onSelect(op);
  };

  return (
    <div className="autocomplete" ref={rootRef}>
      <input
        value={texto}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => {
          setTexto(e.target.value);
          setAberto(true);
          if (e.target.value === "") onSelect(null);
        }}
        onFocus={() => setAberto(true)}
        onKeyDown={(e) => {
          if (!aberto) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setDestaque((d) => Math.min(d + 1, opcoes.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setDestaque((d) => Math.max(d - 1, 0));
          } else if (e.key === "Enter" && opcoes[destaque]) {
            e.preventDefault();
            escolher(opcoes[destaque]);
          } else if (e.key === "Escape") {
            setAberto(false);
          }
        }}
      />
      {aberto && (
        <ul className="ac-lista">
          {carregando && <li className="ac-item ac-info">buscando…</li>}
          {!carregando && opcoes.length === 0 && <li className="ac-item ac-info">nenhum resultado</li>}
          {opcoes.map((op, i) => (
            <li
              key={op.value}
              className={`ac-item ${i === destaque ? "destaque" : ""}`}
              onMouseEnter={() => setDestaque(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                escolher(op);
              }}
            >
              <span className="ac-valor">{op.value}</span>
              <span className="ac-label">{op.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
