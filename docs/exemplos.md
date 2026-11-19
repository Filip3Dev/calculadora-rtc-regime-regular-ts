## Exemplos

> Saídas abaixo capturadas da própria API deste porte (valores conferem com os exemplos oficiais do projeto original). `B` é a URL base — local `http://localhost:8080/api/calculadora` ou pública `https://rtc.bitpag.xyz/api/calculadora`.

### Cálculo com observabilidade

A operação abaixo tem quatro itens: arroz da cesta básica (redução de 100%), cerveja com Imposto Seletivo (a base de CBS/IBS é derivada da base do IS + IS), serviço de educação (redução de 60%) e um item com erro proposital (NCM não vinculada à cClassTrib).

**Entrada** (`operacao.json`):

```json
{
  "id": "6194602ea71cbf9431c236de4409d920",
  "versao": "1.0.0",
  "dhFatoGerador": "2027-03-10T10:00:00-03:00",
  "municipio": 4314902,
  "uf": "RS",
  "itens": [
    {
      "numero": 1, "ncm": "10063021", "cst": "200", "cClassTrib": "200003",
      "baseCalculo": 100.00, "quantidade": 20, "unidade": "KG",
      "aliquotasNominais": { "cbs": 8.8, "ibsEstadual": 0.05, "ibsMunicipal": 0.05 }
    },
    {
      "numero": 2, "ncm": "22030000", "cst": "000", "cClassTrib": "000001",
      "quantidade": 12, "unidade": "LT",
      "impostoSeletivo": {
        "cst": "000", "cClassTrib": "000001", "baseCalculo": 150.00,
        "quantidade": 12, "unidade": "LT", "impostoInformado": 15.00
      },
      "aliquotasNominais": {
        "cbs": 8.8, "ibsEstadual": 0.05, "ibsMunicipal": 0.05,
        "impostoSeletivo": { "adValorem": 10.0 }
      }
    },
    {
      "numero": 3, "nbs": "122011200", "cst": "200", "cClassTrib": "200028",
      "baseCalculo": 1200.00,
      "aliquotasNominais": { "cbs": 8.8, "ibsEstadual": 0.05, "ibsMunicipal": 0.05 }
    },
    {
      "numero": 4, "ncm": "02013000", "cst": "200", "cClassTrib": "200035",
      "baseCalculo": 80.00,
      "aliquotasNominais": { "cbs": 8.8, "ibsEstadual": 0.05, "ibsMunicipal": 0.05 }
    }
  ]
}
```

Envio da operação para cálculo com observabilidade:

```bash
curl -X POST "$B/observabilidade/regime-geral" \
  -H 'Content-Type: application/json' -d @operacao.json
```

Resposta (resumida; cada grupo traz também a `memoriaCalculo` em texto):

```json
{
  "objetos": [
    { "nObj": 1, "estadoItem": "CALCULO_SIMULADO", "tribCalc": { "IBSCBS": { "...": "..." } } },
    { "nObj": 2, "estadoItem": "CALCULO_SIMULADO", "tribCalc": { "IS": { "...": "..." }, "IBSCBS": { "...": "..." } } },
    {
      "nObj": 3,
      "estadoItem": "CALCULO_SIMULADO",
      "tribCalc": { "IBSCBS": { "CST": "200", "cClassTrib": "200028", "gIBSCBS": {
        "vBC": "1200.00",
        "gIBSUF":  { "pIBSUF": "0.05",  "gRed": { "pRedAliq": "60.00", "pAliqEfet": "0.02" }, "vIBSUF": "0.24" },
        "gIBSMun": { "pIBSMun": "0.05", "gRed": { "pRedAliq": "60.00", "pAliqEfet": "0.02" }, "vIBSMun": "0.24" },
        "vIBS": "0.48",
        "gCBS":    { "pCBS": "8.80",    "gRed": { "pRedAliq": "60.00", "pAliqEfet": "3.52" }, "vCBS": "42.24" }
      } } }
    },
    {
      "nObj": 4,
      "estadoItem": "INCONSISTENCIA_ENTRADA",
      "erros": [{
        "code": "REG-011",
        "title": "NCM não vinculada",
        "pointer": "#/itens/3/ncm",
        "detail": "NCM de código 02013000 não vinculada à Classificação Tributária de código 200035 (CBS e IBS)",
        "type": "/api/calculadora/observabilidade/erros?codigo=REG-011"
      }]
    }
  ],
  "total": { "tribCalc": {
    "ISTot": { "vIS": "15.00" },
    "IBSCBSTot": { "vBCIBSCBS": "1465.00", "gIBS": { "vIBS": "0.64" }, "gCBS": { "vCBS": "56.76" } }
  } }
}
```

- A resposta é HTTP 200 mesmo com itens em erro. Por isso, verifique o `estadoItem` de cada item: `CALCULADO`, `CALCULO_SIMULADO`, `INCONSISTENCIA_ENTRADA`, `NAO_IMPLEMENTADO` ou `FALHA_TECNICA`.
- Os totais somam apenas os itens calculados.
- Enviada para `POST /regime-geral`, a mesma operação é rejeitada inteira com HTTP 422 por causa do item 4.
- A partir de 2027, `aliquotasNominais` é obrigatório; antes disso, é proibido. Os cálculos com alíquotas informadas saem como `CALCULO_SIMULADO`, e o header `x-warning-dados-simulados` indica o motivo.
- O campo `dataHoraEmissao` está obsoleto; use `dhFatoGerador`.

### Base de cálculo unificada (NF-e/NFC-e)

Os componentes ficam no mesmo nível dos demais campos, e não dentro de um objeto aninhado (o campo `componentes` também é aceito aninhado, por compatibilidade). `tipoDocumento` aceita `55` (NF-e) ou `65` (NFC-e), e `natureza` aceita `bem` ou `servico` em qualquer caixa.

**Entrada** (`base.json`):

```json
{
  "anoFatoGerador": 2027,
  "tipoDocumento": 55,
  "natureza": "bem",
  "vProd": 1000.00,
  "vFrete": 50.00,
  "vSeg": 20.00,
  "vOutro": 10.00,
  "vDesc": 50.00,
  "vIS": 30.00,
  "vPIS": 9.25,
  "vCOFINS": 46.25,
  "vICMS": 180.00,
  "vFCP": 10.00
}
```

Envio da entrada para cálculo da base unificada:

```bash
curl -X POST "$B/base-calculo/base-calculo-unificada" \
  -H 'Content-Type: application/json' -d @base.json
```

Resposta (os avisos indicam campos ignorados no ano informado):

```json
{
  "baseRG": "870.00000000",
  "baseIS": "840.00000000",
  "baseSN": "1060.00000000",
  "avisos": [
    "Campo vPIS não compõe as bases para o ano 2027 (vigência 2026–2026) e foi ignorado no cálculo",
    "Campo vCOFINS não compõe as bases para o ano 2027 (vigência 2026–2026) e foi ignorado no cálculo"
  ]
}
```

A API aplica a vigência de cada componente ao ano informado. Em 2027, por exemplo, ICMS e FCP ainda são deduzidos da base do regime geral (`baseRG`), mas PIS e COFINS deixam de existir e são ignorados, com aviso.

### Consultas

Consultas aos dados abertos:

```bash
D="$B/dados-abertos"
curl "$D/classificacoes-tributarias/cbs-ibs/class-trib/200028?data=2027-01-01"
curl "$D/fundamentacoes-legais?data=2027-01-01"
curl "$D/ncm?prefixo=2203&limite=5"          # consulta NCM por prefixo (paginada)
curl "$D/aliquota-uf?codigoUf=43&data=2026-06-01"
```

As alíquotas de referência estão cadastradas apenas para 2026. A partir de 2027, a consulta não retorna valor, e as alíquotas devem ser informadas em `aliquotasNominais`.

### Geração e validação de XML

Geração e validação do XML do grupo de tributação a partir da resposta de `POST /regime-geral`:

```bash
# resultado.json: resposta de POST /regime-geral (não a da observabilidade)
curl -X POST "$C/regime-geral" -H 'Content-Type: application/json' -d @operacao-simples.json -o resultado.json

curl -X POST "$C/xml/generate?tipo=nfe" -H 'Content-Type: application/json' \
  --data-binary @resultado.json -o grupo.xml

curl -X POST "$C/xml/validate?tipo=nfe&subtipo=grupo" -H 'Content-Type: text/plain' \
  --data-binary @grupo.xml
```

A validação retorna um objeto com `valido` (booleano) e, quando inválido, a lista de `erros` com linha/coluna. O parâmetro `subtipo` aceita `grupo` (apenas os grupos de tributação) ou `nota` (documento completo); `tipo` aceita `nfe`, `nfce`, `cte`, `cte-simplificado`, `bpe`, `bpe-tm` e `nf3e` (mais `nfse` para validação). `GET /xml/generate` e `GET /xml/validate` listam os tipos de documento aceitos.

### Pedágio

CBS/IBS distribuídos por praça, proporcionalmente à extensão do trecho:

```bash
curl -X POST "$B/pedagio" -H 'Content-Type: application/json' -d @pedagio.json
# pedagio.json:
# {
#   "dataHoraEmissao": "2026-06-01T08:00:00-03:00",
#   "codigoMunicipioOrigem": 4314902, "ufMunicipioOrigem": "RS",
#   "cst": "000", "cClassTrib": "000001",
#   "baseCalculo": 100, "extensaoTotal": 100,
#   "trechos": [
#     { "numero": 1, "municipio": 4314902, "uf": "RS", "extensao": 60 },
#     { "numero": 2, "municipio": 4205407, "uf": "SC", "extensao": 40 }
#   ]
# }
```

No exemplo, o trecho 1 (60% da extensão) recebe alíquota efetiva de CBS `0.54%` (0,9% × 60/100) → `tributoCalculado: "0.54"`; o total de CBS soma `"0.90"`. A partir de 2027 a resposta vem com o header `x-warning-dados-simulados`.

### NFS-e

Base legada e bases unificadas (MEI, locação 99.03, salão/profissional parceiro, documentos de ajuste):

```bash
curl -X POST "$B/nfse/base-calculo" -H 'Content-Type: application/json' \
  -d '{"anoFatoGerador":2026,"valorServico":1000,"descontoIncondicional":50,"pis":10,"cofins":20,"iss":30}'
# → { "baseCalculo": "890.00" }

curl -X POST "$B/base-calculo/base-calculo-unificada-nfse" -H 'Content-Type: application/json' \
  -d '{"anoFatoGerador":2026,"opSimpNac":2,"situacao":"comum","vServ":1000}'
# → { "baseRG": null, "baseSN": null,
#     "avisos": ["E1302: Operação MEI: bases de cálculo não aplicáveis"], "erros": [] }
```
