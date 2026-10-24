import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { ZodError } from 'zod';
import { ApiError, ErrorCodes } from '@barbershop/shared';

const STATUS_TO_CODE: Record<number, string> = {
  400: ErrorCodes.VALIDATION_FAILED, 401: ErrorCodes.UNAUTHENTICATED, 403: ErrorCodes.FORBIDDEN,
  404: ErrorCodes.NOT_FOUND, 409: ErrorCodes.CONFLICT, 413: ErrorCodes.PAYLOAD_TOO_LARGE, 415: ErrorCodes.UNSUPPORTED_FILE, 429: ErrorCodes.RATE_LIMITED, 503: ErrorCodes.SERVICE_UNAVAILABLE,
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ApiError = { success: false, message: 'Something went wrong. Please try again.', code: ErrorCodes.INTERNAL };

    if (exception instanceof ZodError) {
      status = 400;
      body = {
        success: false, code: ErrorCodes.VALIDATION_FAILED, message: 'Please check the highlighted fields.',
        details: exception.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse() as any;
      body = {
        success: false,
        message: typeof r === 'string' ? r : r.message && !Array.isArray(r.message) ? r.message : exception.message,
        code: r?.code ?? STATUS_TO_CODE[status] ?? ErrorCodes.INTERNAL,
        ...(r?.details ? { details: r.details } : {}),
      };
    } else {
      // Log server-side; never leak internals or sensitive data to the client.
      this.logger.error(exception instanceof Error ? exception.stack : 'Unknown error');
    }
    res.status(status).json(body);
  }
}
