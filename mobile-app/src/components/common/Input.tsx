import React, { useState } from "react";
import { StyleSheet, TextInput, TextInputProps, View } from "react-native";
import { Text, useTranslation } from "@/i18n";
import { colors, borderRadius, typography } from "@/theme";

interface InputProps extends TextInputProps {
  label?: string;
  icon?: React.ReactNode;
  error?: string;
}

export function Input({ label, icon, error, style, onFocus, onBlur, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);
  const { t } = useTranslation();
  const placeholder = typeof props.placeholder === "string" ? t(props.placeholder) : props.placeholder;
  const accessibilityLabel = typeof props.accessibilityLabel === "string" ? t(props.accessibilityLabel) : props.accessibilityLabel;

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.inputWrap, focused && styles.focused, error && styles.errored]}>
        {icon ? <View style={styles.icon}>{icon}</View> : null}
        <TextInput
          placeholderTextColor={colors.textPlaceholder}
          style={[styles.input, icon ? styles.withIcon : null, style]}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          {...props}
          placeholder={placeholder}
          accessibilityLabel={accessibilityLabel}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6
  },
  label: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: "600"
  },
  inputWrap: {
    minHeight: 50,
    borderRadius: borderRadius.input,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    backgroundColor: colors.inputBg,
    justifyContent: "center"
  },
  focused: {
    borderColor: colors.primary
  },
  errored: {
    borderColor: colors.error
  },
  icon: {
    position: "absolute",
    left: 14,
    zIndex: 1
  },
  input: {
    ...typography.body,
    color: colors.foreground,
    paddingHorizontal: 14,
    paddingVertical: 13
  },
  withIcon: {
    paddingLeft: 42
  },
  error: {
    ...typography.caption,
    color: colors.error
  }
});
