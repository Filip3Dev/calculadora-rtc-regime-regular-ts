/**
 * Sistema — porte do DownloadController (URL de download da base por
 * plataforma) e VersaoOfflineController (versão local × remota).
 */
import { Controller, Get, HttpCode, NotFoundException, Query, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { calculadora } from "./calc.provider.js";

/**
 * Versão da aplicação lida do package.json no RUNTIME — funciona em dev
 * (tsx) e no container (node dist/main.js, onde npm_package_version não
 * existe e o fallback antigo "0.2.0" fazia o /versao/status mentir em
 * produção). dist/main.js → ../package.json = apps/api/package.json
 * (copiado no Dockerfile).
 */
const APP_VERSION: string = (() => {
  try {
    return JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ).version as string;
  } catch {
    return process.env.npm_package_version ?? "0.0.0";
  }
})();

@ApiTags("sistema")
@Controller()
export class SistemaController {
  /**
   * GET /api/calculadora/download/url?platform=...
   * Resolve a URL de download da base para a plataforma informada.
   * Configuração via env: RTC_DOWNLOAD_URL (genérica) ou
   * RTC_DOWNLOAD_URL_<PLATAFORMA> (ex.: RTC_DOWNLOAD_URL_MAC).
   * Sem URL configurada → 204 No Content (como o original).
   */
  @Get("calculadora/download/url")
  @ApiOperation({ summary: "URL de download da base de dados para a plataforma informada" })
  getDownloadUrl(@Query("platform") platform: string, @Res({ passthrough: true }) res: Response) {
    const normalizada = (platform ?? "").toLowerCase().replaceAll(/[^a-z0-9]/g, "_");
    const url =
      (normalizada && process.env[`RTC_DOWNLOAD_URL_${normalizada.toUpperCase()}`]) ||
      process.env.RTC_DOWNLOAD_URL ||
      "";
    if (!url.trim()) {
      res.status(204);
      return;
    }
    return { url };
  }

  /**
   * GET /api/versao/status — versão da aplicação e da base local, comparadas
   * com a remota (RTC_VERSAO_URL; indisponível → remota nula, com aviso no log).
   */
  @Get("versao/status")
  @HttpCode(200)
  @ApiOperation({ summary: "Status de versão: aplicação e base local versus base remota" })
  async getVersaoStatus(): Promise<Record<string, unknown>> {
    const base = calculadora().versaoBase();
    const local = {
      versaoApp: APP_VERSION,
      descricaoVersaoApp: APP_VERSION,
      versaoDb: base.versao,
      dataVersaoDb: base.data,
    };
    let remota: Record<string, unknown> | null = null;
    const urlRemota = process.env.RTC_VERSAO_URL;
    if (urlRemota) {
      try {
        const res = await fetch(urlRemota, { signal: AbortSignal.timeout(5000) });
        if (res.ok) remota = (await res.json()) as Record<string, unknown>;
      } catch {
        remota = null; // sem retry infinito: status é consultável sob demanda
      }
    }
    const desatualizada =
      remota !== null &&
      typeof remota.versaoDb === "string" &&
      remota.versaoDb !== local.versaoDb;
    return { local, remota, baseDesatualizada: desatualizada };
  }
}
