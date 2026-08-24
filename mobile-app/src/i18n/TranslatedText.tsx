import React from "react";
import { Text as NativeText, TextProps } from "react-native";
import { useTranslation } from "./I18nProvider";

function translateNode(node: React.ReactNode, t: (value: string) => string): React.ReactNode {
  if (typeof node === "string") return t(node);
  if (Array.isArray(node)) return node.map((child, index) => <React.Fragment key={index}>{translateNode(child, t)}</React.Fragment>);
  return node;
}

export function Text({ children, ...props }: TextProps) {
  const { t } = useTranslation();

  return <NativeText {...props}>{translateNode(children, t)}</NativeText>;
}
