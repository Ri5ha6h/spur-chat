import type { ApiErrorCode, ApiErrorResponse } from "@spur/shared";

export class AppError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function apiError(
  code: ApiErrorCode,
  message: string,
): ApiErrorResponse {
  return { error: { code, message } };
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  return new AppError(
    "internal_error",
    "Something went wrong. Please try again.",
    500,
  );
}
