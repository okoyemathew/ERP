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
