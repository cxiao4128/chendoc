import { ApiError, getApiErrorMessage } from "./request";

export interface NormalizedApiError {
  message: string;
  status?: number;
  code?: string;
}

export function normalizeApiError(error: unknown, fallback = "请求失败"): NormalizedApiError {
  if (error instanceof ApiError) {
    return {
      message: error.message || fallback,
      status: error.status,
      code: error.code
    };
  }

  return {
    message: getApiErrorMessage(error, fallback)
  };
}

export function isUnauthorizedError(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}
