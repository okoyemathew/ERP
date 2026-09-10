import { createNavigationContainerRef } from "@react-navigation/native";
import type { AppStackParamList } from "@/types/navigation.types";

export const navigationRef = createNavigationContainerRef<AppStackParamList>();
