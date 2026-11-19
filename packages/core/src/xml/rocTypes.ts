/**
 * Tipos do ROC em JSON (entrada da geração XML) — valores monetários/alíquotas
 * chegam como strings TDec ("1.80") ou números; a escala é preservada com JBD
 * e reemitida com toString() igual ao BigDecimal Java (comportamento do
 * ModelMapper do original).
 */
import { JBD } from "../model/jbd.js";

export type RocJson = Record<string, unknown>;

const get = (o: RocJson | null | undefined, k: string): unknown => (o ? (o[k] as unknown) : undefined);

/** Converte valor ROC (string TDec/número/objeto JBD-like) para texto XML. */
export function val(o: RocJson | null | undefined, campo: string): string | null {
  const v = get(o, campo);
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number") return JBD.fromNumber(v).toString();
  if (typeof v === "object" && v !== null && "toString" in (v as object)) {
    const s = String(v);
    return s.startsWith("[object") ? null : s;
  }
  return null;
}

export function str(o: RocJson | null | undefined, campo: string): string | null {
  const v = get(o, campo);
  return v === null || v === undefined ? null : String(v);
}

export function obj(o: RocJson | null | undefined, campo: string): RocJson | null {
  const v = get(o, campo);
  return v && typeof v === "object" && !Array.isArray(v) ? (v as RocJson) : null;
}

export function arr(o: RocJson | null | undefined, campo: string): RocJson[] {
  const v = get(o, campo);
  return Array.isArray(v) ? (v as RocJson[]) : [];
}
