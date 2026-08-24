import React from "react";
import { Pressable, StyleSheet } from "react-native";

export function Overlay({ onPress }: { onPress?: () => void }) {
  return <Pressable onPress={onPress} style={styles.overlay} accessibilityLabel="Close overlay" />;
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)"
  }
});
