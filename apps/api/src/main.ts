import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";
import { ProblemDetailFilter } from "./problem-detail.filter.js";
import { calculadora } from "./calc.provider.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ["log", "warn", "error"] });
  app.useBodyParser("json", { limit: "50mb" });

  // XML chega como text/plain ou application/xml (validação XSD)
  app.useBodyParser("text", { type: ["text/plain", "application/xml", "text/xml"], limit: "50mb" });

  app.setGlobalPrefix("api");
  app.useGlobalFilters(new ProblemDetailFilter());
  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle("Calculadora de Tributos — RTC (LC 214/2025)")
    .setDescription(
      "API REST que realiza o cálculo da CBS, do IBS e do Imposto Seletivo (Reforma Tributária " +
        "do Consumo — LC 214/2025) nas operações do regime regular. Porte TypeScript com paridade " +
        "estrita de saída com a API oficial (Receita Federal/SERPRO).",
    )
    .setVersion(process.env.npm_package_version ?? "0.3.0")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/swagger", app, document);

  const port = Number(process.env.PORT ?? 8080);
  await app.listen(port, "0.0.0.0");

  const versao = calculadora().versaoBase();
  console.log(`⚡ Calculadora RTC (TS) em http://localhost:${port}/api`);
  console.log(`📚 Swagger: http://localhost:${port}/api/swagger`);
  console.log(`🗄️  Base de dados: versão ${versao.versao} (${versao.data})`);
}

void bootstrap();
