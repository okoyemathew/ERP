import * as SecureStore from "expo-secure-store";

const ONBOARDING_COMPLETED_KEY = "smartpos.onboardingCompleted";

export async function markOnboardingCompleted() {
  await SecureStore.setItemAsync(ONBOARDING_COMPLETED_KEY, "true");
}

export async function hasCompletedOnboarding() {
  return (await SecureStore.getItemAsync(ONBOARDING_COMPLETED_KEY)) === "true";
}
