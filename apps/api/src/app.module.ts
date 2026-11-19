import { Module } from "@nestjs/common";
import { CalculadoraController } from "./calculadora.controller.js";
import { BaseCalculoController } from "./base-calculo.controller.js";
import { DadosAbertosController } from "./dados-abertos.controller.js";
import { XmlController } from "./xml.controller.js";
import { ProblemDetailFilter } from "./problem-detail.filter.js";

@Module({
  controllers: [CalculadoraController, BaseCalculoController, DadosAbertosController, XmlController],
})
export class AppModule {}
