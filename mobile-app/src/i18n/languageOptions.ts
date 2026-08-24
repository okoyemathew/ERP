import type { SupportedLocale } from "./translations";

export const languageOptions: Array<{ name: string; code: string; locale: SupportedLocale }> = [
  { name: "English", code: "EN", locale: "en" },
  { name: "French", code: "FR", locale: "fr" },
  { name: "Arabic", code: "AR", locale: "ar" },
  { name: "Spanish", code: "ES", locale: "es" },
  { name: "Portuguese", code: "PT", locale: "pt" },
  { name: "Swahili", code: "SW", locale: "sw" }
];
