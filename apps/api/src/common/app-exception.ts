import { HttpException } from '@nestjs/common';
import { ErrorCode } from '@barbershop/shared';

/** Throw this for expected business errors; the filter renders the standard envelope. */
export class AppException extends HttpException {
  constructor(status: number, public readonly code: ErrorCode, message: string, public readonly details?: unknown) {
    super({ message, code, details }, status);
  }
}
