/** Ошибка с кодом HTTP; попадает клиенту как { error: { code, message, details } }. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
