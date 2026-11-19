/**
 * Exception filter global — ProblemDetail (RFC 9457), espelhando o
 * ApiExceptionHandler/ObservabilidadeExceptionHandler do serviço Java.
 */
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";
import { NegocioException } from "@rtc/core";

@Catch()
export class ProblemDetailFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ method?: string; url?: string }>();

    const now = new Date().toISOString();
    const instance = request.url ?? "";

    if (exception instanceof NegocioException) {
      const status = this.statusPorCodigo(exception.codigo);
      const body = {
        type: `/api/calculadora/observabilidade/erros?codigo=${exception.codigo}`,
        title: exception.titulo,
        status,
        detail: exception.message,
        instance,
        codigo: exception.codigo,
        campo: exception.campo,
        estadoItem: exception.estadoItem,
        timestamp: now,
      };
      response.status(status).contentType("application/problem+json").json(body);
      return;
    }

    // ErrosCalculoException (observabilidade): 422 com a lista de erros por item
    const erros = (exception as { erros?: unknown }).erros;
    if (Array.isArray(erros)) {
      response.status(HttpStatus.UNPROCESSABLE_ENTITY).contentType("application/problem+json").json({
        type: "/api/calculadora/observabilidade/erros",
        title: "A operação contém inconsistências",
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        detail: `${erros.length} erro(s) detectado(s) no processamento dos itens`,
        instance,
        errors: erros,
        timestamp: now,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response.status(status).json(typeof body === "string" ? { message: body } : body);
      return;
    }

    this.logger.error("Erro interno não tratado", exception as Error);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).contentType("application/problem+json").json({
      type: "/api/calculadora/observabilidade/erros?codigo=CAL-999",
      title: "Erro interno do sistema",
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: (exception as Error)?.message ?? "Erro inesperado",
      instance,
      codigo: "CAL-999",
      timestamp: now,
    });
  }

  private statusPorCodigo(codigo: string): number {
    if (codigo === "REG-024") return HttpStatus.BAD_REQUEST; // CampoInvalidoException
    if (codigo.startsWith("CAL-")) return HttpStatus.INTERNAL_SERVER_ERROR;
    return HttpStatus.UNPROCESSABLE_ENTITY; // REG-* → 422 (ValidacaoException)
  }
}
