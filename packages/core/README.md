# calculadora-rtc-core

Motor de cálculo **CBS / IBS / Imposto Seletivo** da Reforma Tributária do Consumo (LC 214/2025) — porte TypeScript da [Calculadora da Receita Federal](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular), com **paridade estrita** de saída (verificada por golden tests contra a API oficial).

```bash
npx calculadora-rtc-core… # via pacote:
npm i calculadora-rtc-core
```

```js
import { Calculadora } from "calculadora-rtc-core";
// banco SQLite pré-gerado embutido no pacote (rode `node -e` para ver o caminho):
const calc = Calculadora.create(require.resolve? "");
```

## Uso programático

```js
import { Calculadora, gerarXml } from "calculadora-rtc-core";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const db = require.resolve("calculadora-rtc-core/db/calculadora.db");
const calc = Calculadora.create(db);
const roc = calc.calcularTributos(operacao);          // regime-geral
const obs = calc.calcularTributosObservabilidade(op, "https://meu.host"); // observabilidade
const xml = gerarXml(roc, "nfe");                     // XML do grupo RTC
```

## CLI

```
calculadora-rtc calc operacao.json        # regime-geral → JSON
calculadora-rtc obs  operacao.json        # observabilidade (erros por item)
calculadora-rtc xml  roc.json --tipo nfe  # XML (nfe|nfce|cte|cte-simplificado|bpe|bpe-tm|nf3e)
calculadora-rtc versao
```

O banco de dados (gerado dos scripts SQL oficiais do repositório da RFB) vem embutido — zero setup. Código, testes e documentação completos no [repositório](https://github.com/Filip3Dev/calculadora-rtc-regime-regular-ts).

MIT — crédito compartilhado ao projeto original (SERPRO/Receita Federal do Brasil).
