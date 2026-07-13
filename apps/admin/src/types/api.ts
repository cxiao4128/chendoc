export interface ApiResponse<T = unknown> {
  data?: T;
  code?: string | number;
  message?: string;
}

export interface PaginationResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total?: number;
  hasMore?: boolean;
}

export interface PageInfo {
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export type ApiStatus = "idle" | "loading" | "success" | "error";
