export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational: boolean = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ServiceError extends Error {
  constructor(
    public service: string,
    public operation: string,
    public originalError: Error,
    public retryable: boolean = true
  ) {
    super(`${service}.${operation} failed: ${originalError.message}`);
    Object.setPrototypeOf(this, ServiceError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message, true);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class SMSError extends AppError {
  constructor(
    public provider: string,
    public operation: string,
    public originalError: Error,
    public retryable: boolean = true
  ) {
    super(502, `SMS provider error: ${provider}.${operation}`, true);
    Object.setPrototypeOf(this, SMSError.prototype);
  }
}
