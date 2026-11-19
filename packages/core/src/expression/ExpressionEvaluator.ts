/**
 * Avaliador seguro de expressões aritméticas das fórmulas tributárias —
 * porte fiel de AvaliadorExpressaoAritmetica.java (ADR001).
 *
 * As expressões vêm da tabela TRATAMENTO_TRIBUTARIO e usam apenas
 * identificadores camelCase, literais numéricos, + - * / e parênteses.
 * O parser só aceita essa gramática — sandbox por construção.
 *
 * Aritmética: JBD (BigDecimal Java com escala). add/sub/mul exatos com
 * escalas Java; divisão com 34 dígitos significativos HALF_EVEN
 * (= MathContext.DECIMAL128), proibindo divisão por zero. O resultado final
 * passa por arredondarInterno (8 casas, HALF_EVEN).
 */
import { JBD, arredondarInterno } from "../model/jbd.js";

export type VariaveisExpressao = ReadonlyMap<string, JBD | null>;

/** Erros de avaliação — espelham ArithmeticException / RuntimeException do original. */
export class ExpressaoAritmeticaError extends Error {
  constructor(
    message: string,
    readonly expressao: string,
  ) {
    super(message);
    this.name = "ExpressaoAritmeticaError";
  }
}

// ─── Tokenizer ───────────────────────────────────────────────────────────────

type Token =
  | { tipo: "num"; valor: JBD }
  | { tipo: "ident"; nome: string }
  | { tipo: "op"; op: "+" | "-" | "*" | "/" | "(" | ")" };

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i]!;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    if (DIGIT.test(ch)) {
      let j = i;
      while (j < expr.length && DIGIT.test(expr[j]!)) j++;
      if (expr[j] === "." && DIGIT.test(expr[j + 1] ?? "")) {
        j++;
        while (j < expr.length && DIGIT.test(expr[j]!)) j++;
      }
      tokens.push({ tipo: "num", valor: JBD.parse(expr.slice(i, j)) });
      i = j;
      continue;
    }
    if (IDENT_START.test(ch)) {
      let j = i;
      while (j < expr.length && IDENT_PART.test(expr[j]!)) j++;
      tokens.push({ tipo: "ident", nome: expr.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/()".includes(ch)) {
      tokens.push({ tipo: "op", op: ch as "+" | "-" | "*" | "/" | "(" | ")" });
      i++;
      continue;
    }
    throw new ExpressaoAritmeticaError(`Caractere inválido na expressão: '${ch}'`, expr);
  }
  return tokens;
}

// ─── Parser / avaliador (recursive descent) ──────────────────────────────────
//
//   expr    := term (('+'|'-') term)*
//   term    := factor (('*'|'/') factor)*
//   factor  := ('+'|'-')* primary
//   primary := NUM | IDENT | '(' expr ')'

class Parser {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly variaveis: VariaveisExpressao,
    private readonly expressao: string,
  ) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token {
    const t = this.tokens[this.pos];
    if (!t) throw new ExpressaoAritmeticaError("Expressão incompleta", this.expressao);
    this.pos++;
    return t;
  }

  parse(): JBD {
    const v = this.expr();
    if (this.pos !== this.tokens.length) {
      throw new ExpressaoAritmeticaError("Token inesperado após o fim da expressão", this.expressao);
    }
    return v;
  }

  private expr(): JBD {
    let esq = this.term();
    for (;;) {
      const t = this.peek();
      if (t?.tipo === "op" && (t.op === "+" || t.op === "-")) {
        this.next();
        const dir = this.term();
        esq = t.op === "+" ? esq.add(dir) : esq.subtract(dir);
      } else {
        return esq;
      }
    }
  }

  private term(): JBD {
    let esq = this.factor();
    for (;;) {
      const t = this.peek();
      if (t?.tipo === "op" && (t.op === "*" || t.op === "/")) {
        this.next();
        const dir = this.factor();
        if (t.op === "*") {
          esq = esq.multiply(dir);
        } else {
          try {
            esq = esq.divide128(dir);
          } catch (err) {
            throw new ExpressaoAritmeticaError((err as Error).message, this.expressao);
          }
        }
      } else {
        return esq;
      }
    }
  }

  private factor(): JBD {
    const t = this.peek();
    if (t?.tipo === "op" && (t.op === "+" || t.op === "-")) {
      this.next();
      const v = this.factor();
      return t.op === "-" ? v.negate() : v;
    }
    return this.primary();
  }

  private primary(): JBD {
    const t = this.next();
    if (t.tipo === "num") return t.valor;
    if (t.tipo === "op" && t.op === "(") {
      const v = this.expr();
      const fechar = this.next();
      if (fechar.tipo !== "op" || fechar.op !== ")") {
        throw new ExpressaoAritmeticaError("Esperado ')'", this.expressao);
      }
      return v;
    }
    if (t.tipo === "ident") {
      if (!this.variaveis.has(t.nome)) {
        // JEXL strict: variável indefinida é erro
        throw new ExpressaoAritmeticaError(`Variável indefinida: ${t.nome}`, this.expressao);
      }
      const valor = this.variaveis.get(t.nome);
      if (valor === null || valor === undefined) {
        throw new ExpressaoAritmeticaError(`Valor não mapeado corretamente: ${t.nome}`, this.expressao);
      }
      return valor;
    }
    throw new ExpressaoAritmeticaError("Token inesperado", this.expressao);
  }
}

/**
 * Avalia uma expressão aritmética com variáveis JBD.
 *
 * Caso 1 (atalho do original): expressão que é só o nome de uma variável
 * mapeada retorna o valor direto (SEM arredondar e SEM alterar escala);
 * se mapeada com valor nulo, lança erro.
 * Caso geral: parser + arredondamento interno (8 casas, HALF_EVEN).
 */
export class ExpressionEvaluator {
  evaluate(expressao: string, variaveis: VariaveisExpressao): JBD {
    const exprTrim = expressao.trim();
    if (variaveis.has(exprTrim)) {
      const valor = variaveis.get(exprTrim);
      if (valor !== null && valor !== undefined) {
        return valor;
      }
      throw new ExpressaoAritmeticaError(`Valor não mapeado corretamente: ${exprTrim}`, expressao);
    }
    const tokens = tokenize(exprTrim);
    const resultado = new Parser(tokens, variaveis, exprTrim).parse();
    return arredondarInterno(resultado)!;
  }
}
