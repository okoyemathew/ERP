export const fontFamilies = {
  plusJakarta: "Plus Jakarta Sans",
  inter: "Inter"
} as const;

export const typography = {
  screenTitle: {
    fontFamily: fontFamilies.plusJakarta,
    fontWeight: "800" as const,
    fontSize: 20
  },
  kpiValue: {
    fontFamily: fontFamilies.plusJakarta,
    fontWeight: "800" as const,
    fontSize: 24
  },
  cardTitle: {
    fontFamily: fontFamilies.plusJakarta,
    fontWeight: "700" as const,
    fontSize: 14
  },
  subtitle: {
    fontFamily: fontFamilies.inter,
    fontWeight: "600" as const,
    fontSize: 13
  },
  body: {
    fontFamily: fontFamilies.inter,
    fontWeight: "500" as const,
    fontSize: 13
  },
  caption: {
    fontFamily: fontFamilies.inter,
    fontWeight: "500" as const,
    fontSize: 11
  },
  badge: {
    fontFamily: fontFamilies.inter,
    fontWeight: "600" as const,
    fontSize: 10
  },
  navLabel: {
    fontFamily: fontFamilies.inter,
    fontWeight: "600" as const,
    fontSize: 10
  }
} as const;
