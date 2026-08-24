export interface ApiListResponse<T> {
  data: T[];
  page?: number;
  total?: number;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}
