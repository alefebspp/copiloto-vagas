import { describe, expect, it } from "vitest";
import { ErroDeDominio } from "./erro-de-dominio.js";

describe("ErroDeDominio", () => {
  it("carrega um código semântico, sem nenhum status HTTP", () => {
    const erro = new ErroDeDominio("TRANSICAO_INVALIDA", "SALVA não vai direto para TECNICA");

    expect(erro.codigo).toBe("TRANSICAO_INVALIDA");
    expect(erro.message).toBe("SALVA não vai direto para TECNICA");
    expect(Object.keys(erro)).not.toContain("status");
  });

  it("é distinguível de erros inesperados na borda", () => {
    const erros: unknown[] = [new ErroDeDominio("VAGA_NAO_ENCONTRADA", "vaga 01J..."), new Error("timeout")];

    expect(erros.map((erro) => erro instanceof ErroDeDominio)).toEqual([true, false]);
  });
});
