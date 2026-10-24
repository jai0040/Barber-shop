import { PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

/** Usage: @Body(new ZodValidationPipe(schema)) — ZodError is rendered by AllExceptionsFilter. */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}
  transform(value: unknown) { return this.schema.parse(value); }
}
