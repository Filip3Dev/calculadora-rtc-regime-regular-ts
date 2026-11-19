/**
 * XML — validação de documentos contra os XSDs oficiais (SEFAZ) via xmllint.
 * A geração de XML (ROC → DF-e) ainda não foi portada (leiautes JAXB extensos).
 */
import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {spawnSync} from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
/** XSDs copiados do projeto original (resources/xml). */
const XML_DIR = path.resolve(here, "../../../db/xsd");

const TIPOS = ["nfe", "nfce", "nfse", "cte", "cte-simplificado", "bpe", "bpe-tm", "nf3e"] as const;
type Tipo = (typeof TIPOS)[number];

@ApiTags("xml")
@Controller("calculadora/xml")
export class XmlController {
  @Get("validate")
  @ApiOperation({ summary: "Tipos de documento e subtipos suportados na validação" })
  tipos() {
    return TIPOS.map((t) => ({ tipo: t, subtipos: ["grupo", "nota"] }));
  }

  /** POST /api/calculadora/xml/validate?tipo=nfe&subtipo=grupo — body: XML puro. */
  @Post("validate")
  @HttpCode(200)
  @ApiOperation({ summary: "Valida um XML (grupo ou nota completa) contra o XSD oficial do tipo de documento" })
  validar(@Query("tipo") tipo: string, @Query("subtipo") subtipo: string, @Body() xml: string) {
    if (!TIPOS.includes(tipo as Tipo)) {
      throw new BadRequestException(`Tipo '${tipo}' não suportado. Use um de: ${TIPOS.join(", ")}`);
    }
    const sub = subtipo === "nota" ? "nota" : "grupo";
    const xsd = path.join(XML_DIR, tipo, `${sub}.xsd`);
    if (!existsSync(xsd)) {
      throw new BadRequestException(`XSD não encontrado para ${tipo}/${sub}`);
    }
    if (typeof xml !== "string" || xml.trim() === "") {
      throw new BadRequestException("Corpo da requisição deve conter o XML a validar");
    }

    const tmp = mkdtempSync(path.join(os.tmpdir(), "rtc-xml-"));
    try {
      const xmlFile = path.join(tmp, "doc.xml");
      writeFileSync(xmlFile, xml, "utf8");
      // --noent: não resolver entidades (anti-XXE, como o original)
      const res = spawnSync("xmllint", ["--noout", "--noent", "--schema", xsd, xmlFile], {
        encoding: "utf8",
      });
      const stderr = (res.stderr ?? "")
        .trim()
        .split("\n")
        .map((l) => l.replaceAll(xmlFile, "documento"))
        .join("\n");
      const valido = res.status === 0;
      return { tipo, subtipo: sub, valido, erros: valido ? [] : stderr.split("\n").filter(Boolean) };
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  @Get("generate")
  @ApiOperation({ summary: "Situação da geração de XML a partir do ROC" })
  geracaoStatus() {
    return {
      suportado: false,
      mensagem:
        "A geração de XML (ROC → DF-e) ainda não foi portada para TypeScript. " +
        "A validação contra os XSDs oficiais está disponível em POST /api/calculadora/xml/validate.",
      tiposPlanejados: TIPOS,
    };
  }
}
