import { HttpException, type HttpStatus } from '@nestjs/common';

export class ApiError extends HttpException {
  public constructor(status: HttpStatus, code: string, message: string) {
    super({ error: { code, message } }, status);
  }
}
