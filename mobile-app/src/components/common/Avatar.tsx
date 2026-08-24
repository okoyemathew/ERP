import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { avatarColors, borderRadius, colors } from "@/theme";
import { initials } from "@/utils/format";

const hashName = (value: string) => value.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);

export function Avatar({ name, imageUri, size = 44 }: { name: string; imageUri?: string; size?: number }) {
  const backgroundColor = avatarColors[hashName(name) % avatarColors.length];
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: borderRadius.avatar, backgroundColor }]}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={[styles.image, { width: size, height: size, borderRadius: borderRadius.avatar }]} />
      ) : (
        <Text style={[styles.text, { fontSize: Math.max(12, size * 0.34) }]}>{initials(name)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  image: {
    resizeMode: "cover"
  },
  text: {
    color: colors.surface,
    fontWeight: "700"
  }
});
