// Expected business rule errors. The domain only knows the code;
// the presentation layer maps it to an HTTP status (ADR-002).
export type DomainErrorCode =
  | "JOB_NOT_FOUND"
  | "JOB_CLOSED"
  | "JOB_NOT_CLOSED"
  | "NOTE_REQUIRED"
  | "FUTURE_DATE"
  | "NOTHING_TO_UNDO";

export class DomainError extends Error {
  override readonly name = "DomainError";

  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
  }
}
