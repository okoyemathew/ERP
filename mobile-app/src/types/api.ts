import type { ApiErrorCode } from "@/api/errors";

export interface ApiFailure {
  message: string;
  code: ApiErrorCode;
  status?: number;
  details?: unknown;
}
