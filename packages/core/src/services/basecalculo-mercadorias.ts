/**
 * Base de cálculo de mercadorias — porte fiel de BaseCalculoService:
 * calcularISMercadorias (POST /base-calculo/is-mercadorias) e
 * calcularCibs (POST /base-calculo/cbs-ibs-mercadorias).
 */
import { JBD } from "../model/jbd.js";
import { CampoInvalidoException } from "../errors.js";

export interface BaseCalculoISMercadoriasInput {
  anoFatoGerador: number;
  valorBem: JBD;
  ajusteAcrescimos: JBD;
  juros: JBD;
  multas: JBD;
  encargos: JBD;
  freteCobrado: JBD;
  outrosTributos: JBD;
  demaisImportancias: JBD;
  icms: JBD;
  iss: JBD;
  cosip: JBD;
  ipi: JBD;
  descontoIncondicional: JBD;
  bonificacao: JBD;
  devolucaoVendas: JBD;
}

export interface BaseCalculoCibsInput {
  anoFatoGerador: number;
  valorBem: JBD;
  ajusteAcrescimos: JBD;
  juros: JBD;
  multas: JBD;
  encargos: JBD;
  frete: JBD;
  impostoSeletivo: JBD;
  outrosTributos: JBD;
  demaisImportancias: JBD;
  icms: JBD;
  iss: JBD;
  pis: JBD;
  pisImportacao: JBD;
  cofins: JBD;
  cofinsImportacao: JBD;
  cosip: JBD;
  ipi: JBD;
  descontoIncondicional: JBD;
}

const ANO_INICIO_CBS_IBS = 2026;
const ANO_INICIO_IS = 2027;
const ANO_EXTINCAO_PIS_COFINS = 2027;
const ANO_EXTINCAO_ICMS_ISS = 2033;

export class BaseCalculoMercadoriasService {
  calcularISMercadorias(input: BaseCalculoISMercadoriasInput): { baseCalculo: string } {
    const ano = input.anoFatoGerador;
    if (ano < ANO_INICIO_IS) {
      throw new CampoInvalidoException(`Para IS, o ano do fato gerador deve ser ${ANO_INICIO_IS} ou superior`);
    }
    this.validaValoresForaLimite({ ICMS: input.icms, ISS: input.iss }, ano, ANO_EXTINCAO_ICMS_ISS);

    const integra = input.valorBem
      .add(input.ajusteAcrescimos)
      .add(input.juros)
      .add(input.multas)
      .add(input.encargos)
      .add(input.freteCobrado)
      .add(input.outrosTributos)
      .add(input.demaisImportancias);

    const naoIntegra = input.cosip
      .add(input.ipi)
      .add(input.descontoIncondicional)
      .add(input.bonificacao)
      .add(input.devolucaoVendas)
      .add(input.icms)
      .add(input.iss);

    const baseCalculo = integra.subtract(naoIntegra);
    this.validaValorFinal(baseCalculo);
    return { baseCalculo: baseCalculo.toPlainString() };
  }

  calcularCibs(input: BaseCalculoCibsInput): { baseCalculo: string } {
    const ano = input.anoFatoGerador;
    if (ano < ANO_INICIO_CBS_IBS) {
      throw new CampoInvalidoException(`Para CBS/IBS, o ano do fato gerador deve ser ${ANO_INICIO_CBS_IBS} ou superior`);
    }
    this.validaValoresForaLimite(
      { PIS: input.pis, "PIS Importação": input.pisImportacao, COFINS: input.cofins, "COFINS Importação": input.cofinsImportacao },
      ano,
      ANO_EXTINCAO_PIS_COFINS,
    );
    this.validaValoresForaLimite({ ICMS: input.icms, ISS: input.iss }, ano, ANO_EXTINCAO_ICMS_ISS);

    const integra = input.valorBem
      .add(input.ajusteAcrescimos)
      .add(input.juros)
      .add(input.multas)
      .add(input.encargos)
      .add(input.frete)
      .add(input.impostoSeletivo)
      .add(input.outrosTributos)
      .add(input.demaisImportancias);

    const naoIntegra = input.cosip
      .add(input.ipi)
      .add(input.descontoIncondicional)
      .add(input.pis)
      .add(input.pisImportacao)
      .add(input.cofins)
      .add(input.cofinsImportacao)
      .add(input.icms)
      .add(input.iss);

    const baseCalculo = integra.subtract(naoIntegra);
    this.validaValorFinal(baseCalculo);
    return { baseCalculo: baseCalculo.toPlainString() };
  }

  private validaValoresForaLimite(campos: Record<string, JBD>, ano: number, anoExtincao: number): void {
    if (ano >= anoExtincao) {
      const informados = Object.entries(campos)
        .filter(([, v]) => v.compareTo(JBD.ZERO) !== 0)
        .map(([k]) => k)
        .sort();
      if (informados.length > 0) {
        throw new CampoInvalidoException(
          `Os seguintes campos não podem ser informados a partir de ${anoExtincao}: ${informados.join(", ")}`,
        );
      }
    }
  }

  private validaValorFinal(baseCalculo: JBD): void {
    if (baseCalculo.compareTo(JBD.ZERO) < 0) {
      throw new CampoInvalidoException(
        "Base de cálculo não pode ser negativa. A soma dos valores que não integram a base é maior que a soma dos valores que integram a base.",
      );
    }
  }
}
