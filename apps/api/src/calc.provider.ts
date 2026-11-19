/**
 * Provedor singleton da Calculadora (motor calculadora-rtc-core) para a API.
 */
import { CATALOGO_ERROS, Calculadora } from "calculadora-rtc-core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultDb = path.resolve(here, "../../../db/calculadora.db");

export { CATALOGO_ERROS };

export const CALCULADORA = Calculadora.create(process.env.RTC_DB ?? defaultDb, {
  ibsEnabled: process.env.RTC_IBS_ENABLED !== "false",
  memoriaCalculoEnabled: process.env.RTC_MEMORIA !== "false",
});

export function calculadora(): Calculadora {
  return CALCULADORA;
}
