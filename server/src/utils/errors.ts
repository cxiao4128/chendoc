export type AppErrorOptions = {
  cause?: unknown;
  expose?: boolean;
};

export class AppError extends Error {
  statusCode: number;
  code: string;
  expose: boolean;

  constructor(statusCode: number, code: string, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.expose = options.expose ?? statusCode < 500;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "请求参数不正确", code = "BAD_REQUEST", options?: AppErrorOptions) {
    super(400, code, message, options);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "未登录或登录已过期", code = "UNAUTHORIZED", options?: AppErrorOptions) {
    super(401, code, message, options);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "没有权限执行此操作", code = "FORBIDDEN", options?: AppErrorOptions) {
    super(403, code, message, options);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "资源不存在", code = "NOT_FOUND", options?: AppErrorOptions) {
    super(404, code, message, options);
  }
}

export class ConflictError extends AppError {
  constructor(message = "资源已被其他操作修改", code = "CONFLICT", options?: AppErrorOptions) {
    super(409, code, message, options);
  }
}
