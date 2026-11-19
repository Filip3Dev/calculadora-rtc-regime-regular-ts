/**
 * Totalizadores — porte fiel de ValoresTotaisDomain.create + accumulators
 * (IBSCBSTotalDomain, IBSTotalDomain, CBSTotalDomain, IBSUF/IBSMun/Monofasia/
 * Estorno accumulators). Somas sem arredondamento intermediário.
 */
import { JBD } from "../model/jbd.js";
import type {
  MonofasiaTotalDomain,
  ObjetoDomain,
  ValoresTotaisDomain,
} from "../model/types.js";

export function criarTotais(detalhes: ObjetoDomain[]): ValoresTotaisDomain | null {
  if (detalhes.length === 0) return null;
  return { tribCalc: criarTributosTotais(detalhes) };
}

function criarTributosTotais(detalhes: ObjetoDomain[]) {
  const qualquerIS = detalhes.some((d) => d.possuiImpostoSeletivo());
  const istot = qualquerIS
    ? {
        vIS: detalhes.reduce((acc, d) => acc.add(d.getValorImpostoSeletivo()), JBD.ZERO),
      }
    : null;

  const vBCIBSCBS = detalhes.reduce((acc, d) => acc.add(d.getValorBaseCalculoIBSCBS()), JBD.ZERO);

  // gIBS: gIBSUF/gIBSMun sempre existem (mesmo zerados) — necessário p/ XML
  const possuiIbsUf = detalhes.some((d) => d.possuiIBSUF());
  const gIBSUF = possuiIbsUf
    ? detalhes.reduce(
        (acc, d) => ({
          vDif: acc.vDif.add(d.getGIBSUF()?.getVDif() ?? JBD.ZERO),
          vDevTrib: acc.vDevTrib.add(d.getGIBSUF()?.getVDevTrib() ?? JBD.ZERO),
          vIBSUF: acc.vIBSUF.add(d.getGIBSUF()?.vIBSUF ?? JBD.ZERO),
        }),
        { vDif: JBD.ZERO, vDevTrib: JBD.ZERO, vIBSUF: JBD.ZERO },
      )
    : { vDif: JBD.ZERO, vDevTrib: JBD.ZERO, vIBSUF: JBD.ZERO };

  const possuiIbsMun = detalhes.some((d) => d.possuiIBSMun());
  const gIBSMun = possuiIbsMun
    ? detalhes.reduce(
        (acc, d) => ({
          vDif: acc.vDif.add(d.getGIBSMun()?.getVDif() ?? JBD.ZERO),
          vDevTrib: acc.vDevTrib.add(d.getGIBSMun()?.getVDevTrib() ?? JBD.ZERO),
          vIBSMun: acc.vIBSMun.add(d.getGIBSMun()?.vIBSMun ?? JBD.ZERO),
        }),
        { vDif: JBD.ZERO, vDevTrib: JBD.ZERO, vIBSMun: JBD.ZERO },
      )
    : { vDif: JBD.ZERO, vDevTrib: JBD.ZERO, vIBSMun: JBD.ZERO };

  const gIBS = {
    gIBSUF,
    gIBSMun,
    vIBS: gIBSUF.vIBSUF.add(gIBSMun.vIBSMun),
    vCredPres: JBD.ZERO,
    vCredPresCondSus: JBD.ZERO,
  };

  const possuiCbs = detalhes.some((d) => d.possuiCbs());
  const gCBS = possuiCbs
    ? detalhes.reduce(
        (acc, d) => {
          const cbs = d.getGCBS();
          return {
            vDif: acc.vDif.add(cbs?.getVDif() ?? JBD.ZERO),
            vDevTrib: acc.vDevTrib.add(cbs?.getVDevTrib() ?? JBD.ZERO),
            vCBS: acc.vCBS.add(cbs?.vCBS ?? JBD.ZERO),
            vCredPres: JBD.ZERO,
            vCredPresCondSus: JBD.ZERO,
          };
        },
        { vDif: JBD.ZERO, vDevTrib: JBD.ZERO, vCBS: JBD.ZERO, vCredPres: JBD.ZERO, vCredPresCondSus: JBD.ZERO },
      )
    : { vDif: JBD.ZERO, vDevTrib: JBD.ZERO, vCBS: JBD.ZERO, vCredPres: JBD.ZERO, vCredPresCondSus: JBD.ZERO };

  const possuiMono = detalhes.some((d) => d.possuiMonofasia());
  const gMono: MonofasiaTotalDomain = possuiMono
    ? detalhes.reduce(
        (acc, d) => {
          const m = d.getGIBSCBSMono();
          return {
            vIBSMono: acc.vIBSMono.add(m?.getVIBSMono() ?? JBD.ZERO),
            vCBSMono: acc.vCBSMono.add(m?.getVCBSMono() ?? JBD.ZERO),
            vIBSMonoReten: acc.vIBSMonoReten.add(m?.getVIBSMonoReten() ?? JBD.ZERO),
            vCBSMonoReten: acc.vCBSMonoReten.add(m?.getVCBSMonoReten() ?? JBD.ZERO),
            vIBSMonoRet: acc.vIBSMonoRet.add(m?.getVIBSMonoRet() ?? JBD.ZERO),
            vCBSMonoRet: acc.vCBSMonoRet.add(m?.getVCBSMonoRet() ?? JBD.ZERO),
          };
        },
        {
          vIBSMono: JBD.ZERO,
          vCBSMono: JBD.ZERO,
          vIBSMonoReten: JBD.ZERO,
          vCBSMonoReten: JBD.ZERO,
          vIBSMonoRet: JBD.ZERO,
          vCBSMonoRet: JBD.ZERO,
        },
      )
    : {
        vIBSMono: JBD.ZERO,
        vCBSMono: JBD.ZERO,
        vIBSMonoReten: JBD.ZERO,
        vCBSMonoReten: JBD.ZERO,
        vIBSMonoRet: JBD.ZERO,
        vCBSMonoRet: JBD.ZERO,
      };

  return { ISTot: istot, IBSCBSTot: { vBCIBSCBS, gIBS, gCBS, gMono, gEstornoCred: null } };
}
