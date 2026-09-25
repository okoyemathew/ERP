import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Alert, Text, TextInput, type AlertButton } from "react-native";
import * as SecureStore from "expo-secure-store";
import { termTranslations, translations, type SupportedLocale } from "./translations";

const LANGUAGE_KEY = "nexpos.locale";

type I18nContextValue = {
  locale: string;
  isLoading: boolean;
  setLocale: (locale: string) => Promise<void>;
  t: (value: string) => string;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

type CreateElement = (type: unknown, props?: unknown, ...children: unknown[]) => React.ReactElement | null;

let activeLocale = "en";
let textPatchInstalled = false;
const reactRuntime = React as unknown as { createElement: CreateElement };
const originalCreateElement = reactRuntime.createElement.bind(React);
const originalAlert = Alert.alert.bind(Alert);

function isLocaleCode(value: string | null | undefined): value is string {
  return Boolean(value && /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(value));
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function translate(value: string, locale: string = activeLocale) {
  if (locale === "en") return value;

  const normalized = normalizeText(value);
  if (!normalized) return value;

  const exact = translations[locale as SupportedLocale]?.[normalized];
  if (exact) return exact;

  const humanizedEnum = /^[A-Z0-9_]+$/.test(normalized) ? normalized.replace(/_/g, " ").toLowerCase() : null;
  if (humanizedEnum) {
    const translationMap = translations[locale as SupportedLocale] ?? {};
    const enumExact = translationMap[humanizedEnum] ?? translationMap[toTitleCase(humanizedEnum)];
    if (enumExact) return enumExact;
    const enumTerms = translateTerms(humanizedEnum, locale);
    if (enumTerms !== humanizedEnum) return toTitleCase(enumTerms);
  }

  return translateTerms(value, locale);
}

function toTitleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function translateTerms(value: string, locale: string) {
  const termMap = termTranslations[locale as SupportedLocale] ?? {};
  let changed = false;

  const translated = value.replace(/[A-Za-z][A-Za-z'-]*/g, (word) => {
    const direct = termMap[word] ?? termMap[word.toLowerCase()];
    if (!direct) return word;
    changed = true;
    if (word === word.toUpperCase()) return direct.toUpperCase();
    if (word[0] === word[0].toUpperCase()) return direct.charAt(0).toUpperCase() + direct.slice(1);
    return direct;
  });

  return changed ? translated : value;
}

function translateChild(child: unknown): unknown {
  if (typeof child === "string") return translate(child);
  if (Array.isArray(child)) return child.map(translateChild);
  return child;
}

function translateAccessibilityLabel(value: unknown) {
  return typeof value === "string" ? translate(value) : value;
}

function translateAlertButtons(buttons?: AlertButton[]) {
  return buttons?.map((button) => ({
    ...button,
    text: button.text ? translate(button.text) : button.text,
  }));
}

export function installI18nTextPatch() {
  if (textPatchInstalled) return;
  textPatchInstalled = true;

  Alert.alert = (title, message, buttons, options) => originalAlert(translate(title), message ? translate(message) : message, translateAlertButtons(buttons), options);

  reactRuntime.createElement = (type: unknown, props?: unknown, ...children: unknown[]) => {
    let nextProps = props;
    let nextChildren = children;

    if (type === Text) {
      nextChildren = children.map(translateChild);
    }

    if (type === TextInput && props && typeof props === "object") {
      const inputProps = props as { placeholder?: unknown; accessibilityLabel?: unknown };
      nextProps = {
        ...props,
        placeholder: translateAccessibilityLabel(inputProps.placeholder),
        accessibilityLabel: translateAccessibilityLabel(inputProps.accessibilityLabel),
      };
    } else if (props && typeof props === "object" && "accessibilityLabel" in props) {
      nextProps = {
        ...props,
        accessibilityLabel: translateAccessibilityLabel((props as { accessibilityLabel?: unknown }).accessibilityLabel),
      };
    }

    return originalCreateElement(type, nextProps, ...nextChildren);
  };
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState("en");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    installI18nTextPatch();
    void SecureStore.getItemAsync(LANGUAGE_KEY)
      .then((storedLocale) => {
        const nextLocale = isLocaleCode(storedLocale) ? storedLocale : "en";
        activeLocale = nextLocale;
        setLocaleState(nextLocale);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const setLocale = useCallback(async (nextLocale: string) => {
    activeLocale = nextLocale;
    await SecureStore.setItemAsync(LANGUAGE_KEY, nextLocale);
    setLocaleState(nextLocale);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      isLoading,
      setLocale,
      t: (text: string) => translate(text, locale),
    }),
    [isLoading, locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useTranslation must be used within I18nProvider");
  }

  return context;
}
