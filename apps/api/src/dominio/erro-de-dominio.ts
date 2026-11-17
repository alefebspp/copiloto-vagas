// Erros esperados de regra de negócio. O domínio só conhece o código;
// quem traduz o código em status HTTP é a camada de apresentação (ADR-002).
export type CodigoErroDeDominio = "TRANSICAO_INVALIDA" | "VAGA_NAO_ENCONTRADA";

export class ErroDeDominio extends Error {
  override readonly name = "ErroDeDominio";

  constructor(
    readonly codigo: CodigoErroDeDominio,
    mensagem: string,
  ) {
    super(mensagem);
  }
}
