# Registro de decisões de arquitetura (ADRs)

Cada ADR registra o contexto, a decisão e as consequências, inclusive as ruins. Uma decisão substituída não é apagada: ganha o status "Substituída por ADR-NNN".

---

## ADR-001: Ports and adapters, em um monorepo

**Status:** aceita (16/11/2026)

### Contexto

O projeto vai rodar em Lambda, consumir mensagens do SQS, persistir no DynamoDB e chamar o Bedrock. Se as regras do funil importarem esses SDKs, elas só podem ser testadas com a AWS (ou com mocks de SDK) e ficam presas a ela. O projeto também terá uma API e um front que compartilham contratos.

### Decisão

1. **O domínio define as interfaces (ports) de que precisa**, em `dominio/ports/`. Os adapters (`adapters/`) implementam esses contratos. A dependência aponta sempre para dentro: a infraestrutura depende do domínio, nunca o contrário (inversão de dependência).
2. **A regra é verificada por máquina:** o ESLint (`no-restricted-imports`) falha se um arquivo de `dominio/` importar `aplicacao/`, `adapters/`, `apresentacao/`, `@aws-sdk/*`, `fastify` ou `zod`.
3. **Monorepo com pnpm workspaces** (`apps/*`): um lockfile, testes e CI de uma vez só, e commits atômicos quando um contrato e quem o consome mudam juntos.

### Consequências

- As regras de negócio rodam iguais numa Lambda, num script ou num teste, e os testes de domínio são rápidos e determinísticos, sem rede.
- Trocar o DynamoDB por Postgres significa escrever um novo adapter de `VagaRepository`. O domínio e os casos de uso não mudam.
- Custo: mais arquivos e uma camada de indireção. Para um CRUD trivial seria exagero; aqui se justifica pela quantidade de serviços externos.
- O monorepo **não** centraliza o deploy: a API (Lambda) e o web (S3 + CloudFront) têm deploys independentes, disparados só quando o respectivo app muda.

---

## ADR-002: Funil como máquina de estados, com histórico append-only

**Status:** aceita (16/11/2026)

### Contexto

Processos seletivos são informais: às vezes a triagem e a técnica acontecem antes de a vaga ser atualizada. Ao mesmo tempo, o valor do copiloto está nas métricas da busca (em que etapa eu mais sou eliminado? quanto tempo cada etapa leva?), e isso exige saber o caminho de cada vaga, não só onde ela está.

### Decisão

1. **Funil linear:** a vaga avança uma etapa por vez, sem pular. Etapas que aconteceram sem registro são registradas uma a uma.
2. **Saídas:** `RECUSADA` e `DESISTI` são alcançáveis a partir de qualquer etapa ativa.
3. **Reabrir:** de `RECUSADA` ou `DESISTI` para uma etapa escolhida pelo usuário. É a única transição que pode pular etapas.
4. **Histórico append-only:** a vaga guarda a lista de transições (`de`, `para`, `em`). A etapa atual é derivada da última transição. Reabrir acrescenta uma transição; a recusa continua no histórico.
5. **Desfazer:** remove apenas a transição mais recente, uma de cada vez. É a única exceção ao append-only, para corrigir enganos sem poluir as métricas.
6. **Erros:** uma transição inválida lança `ErroDeDominio` com um código semântico (`TRANSICAO_INVALIDA`, `VAGA_NAO_ENCONTRADA`). O domínio não conhece HTTP: a camada de apresentação traduz o código em status (422, 404), e qualquer outro erro vira 500 genérico, com o detalhe só no log.
7. **Tempo e identidade entram de fora:** o domínio não chama `new Date()` nem gera IDs. A aplicação fornece `agora` e o ID (ULID, ordenável por tempo). Datas são guardadas em UTC (ISO 8601) e convertidas só na tela.
8. **Assinatura:** `moverEtapa(vaga, destino, agora)` devolve uma **nova** vaga (imutável) com a transição acrescentada, ou lança `ErroDeDominio`.

A lista exata de etapas será fechada na implementação do domínio (M1, parte 2).

### Consequências

- Métricas de conversão por etapa e tempo por etapa saem direto do histórico.
- Os testes fixam `agora` e o ID, então são determinísticos.
- Registrar etapas uma a uma custa alguns cliques a mais ao usuário. Aceito em troca de um histórico fiel.
- "Desfazer" quebra a imutabilidade estrita do histórico. Aceito porque é limitado à última transição.
- Exceções não aparecem na assinatura da função. Mitigação: um único tipo (`ErroDeDominio`) com códigos tipados, tratado num só lugar na borda.
