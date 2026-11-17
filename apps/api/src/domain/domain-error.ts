// Expected business rule errors. The domain only knows the code;
// the presentation layer maps it to an HTTP status (ADR-002).
export type DomainErrorCode = "INVALID_TRANSITION" | "JOB_NOT_FOUND";

export class DomainError extends Error {
  override readonly name = "DomainError";

  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
  }
}
