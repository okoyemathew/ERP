import { AppApiError } from "@/api/errors";
import { offlineSyncService } from "@/services/offline-sync.service";
import type { ApiMutationPayload } from "@/types/sync";

export function isOfflineApiError(error: unknown) {
  return error instanceof AppApiError && (error.code === "NETWORK" || error.code === "TIMEOUT");
}

export async function queueOfflineMutation<T>(
  error: unknown,
  mutation: Omit<ApiMutationPayload, "deviceId">,
  fallback: T
): Promise<T> {
  if (!isOfflineApiError(error)) throw error;
  await offlineSyncService.enqueueMutation(mutation);
  return fallback;
}
