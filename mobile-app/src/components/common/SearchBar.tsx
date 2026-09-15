import React from "react";
import { Search } from "lucide-react-native";
import { colors } from "@/theme";
import { Input } from "./Input";

export function SearchBar({ value, onChangeText, placeholder = "Search", bottomSheet = false, onFocus }: { value: string; onChangeText: (value: string) => void; placeholder?: string; bottomSheet?: boolean; onFocus?: () => void }) {
  return (
    <Input
      bottomSheet={bottomSheet}
      onFocus={onFocus}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      icon={<Search size={16} color={colors.textPlaceholder} />}
      accessibilityLabel={placeholder}
    />
  );
}
