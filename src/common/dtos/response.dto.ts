export interface ApiLinks {
  self: string;
  [key: string]: string;
}

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
  _links: ApiLinks;
}


export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: string[];
  };
  _links: {
    documentation?: string;
  };
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
}
