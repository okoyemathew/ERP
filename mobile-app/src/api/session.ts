import { AppApiError } from "./errors";
import { getAuthSession } from "./tokenStorage";

export async function getRequiredBusinessId(): Promise<string> {
  const session = await getAuthSession();
  const businessId = session?.user.businessId;

  if (!businessId) {
    throw new AppApiError("Business context is not available. Please sign in again.", "UNAUTHORIZED", 401);
  }

  return businessId;
}

export async function getRequiredAuthContext(): Promise<{ businessId: string; userId: string }> {
  const session = await getAuthSession();
  const businessId = session?.user.businessId;
  const userId = session?.user.id;

  if (!businessId || !userId) {
    throw new AppApiError("User context is not available. Please sign in again.", "UNAUTHORIZED", 401);
  }

  return { businessId, userId };
}
