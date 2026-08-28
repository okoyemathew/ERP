import axios, { AxiosError } from "axios";

export type ApiErrorCode = "BAD_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "VALIDATION" | "RATE_LIMITED" | "SERVER" | "NETWORK" | "TIMEOUT" | "UNKNOWN";

export class AppApiError extends Error {
  code: ApiErrorCode;
  status?: number;
  details?: unknown;

  constructor(message: string, code: ApiErrorCode, status?: number, details?: unknown) {
    super(message);
    this.name = "AppApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const statusCodeMap: Record<number, ApiErrorCode> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "VALIDATION",
  429: "RATE_LIMITED",
  500: "SERVER"
};

function responseMessage(data: unknown, fallback: string) {
  if (typeof data === "object" && data !== null) {
    const maybe = data as { message?: unknown; error?: unknown };
    if (Array.isArray(maybe.message)) return maybe.message.join("\n");
    if (typeof maybe.message === "string") return maybe.message;
    if (typeof maybe.error === "string") return maybe.error;
  }
  return fallback;
}

export function normalizeApiError(error: unknown): AppApiError {
  if (error instanceof AppApiError) return error;

  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;

    if (axiosError.code === "ECONNABORTED") {
      return new AppApiError("The request timed out. Check your connection and try again.", "TIMEOUT");
    }

    if (!axiosError.response) {
      return new AppApiError("Cannot reach the server. Check your internet connection and try again.", "NETWORK");
    }

    const status = axiosError.response.status;
    const code = statusCodeMap[status] ?? (status >= 500 ? "SERVER" : "UNKNOWN");
    const fallback = status >= 500 ? "Server error. Please try again shortly." : "Request failed. Please check your input and try again.";
    return new AppApiError(responseMessage(axiosError.response.data, fallback), code, status, axiosError.response.data);
  }

  if (error instanceof Error) {
    return new AppApiError(error.message, "UNKNOWN");
  }

  return new AppApiError("Something went wrong. Please try again.", "UNKNOWN");
}
