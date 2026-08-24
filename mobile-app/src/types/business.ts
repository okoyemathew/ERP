export interface BusinessProfile {
  id: string;
  name: string;
  about?: string | null;
  legalName?: string | null;
  status?: string;
  currency?: string | null;
  timezone?: string | null;
  settings?: unknown;
  receiptSettings?: unknown;
  taxSettings?: unknown;
  notificationSettings?: unknown;
}

export interface BusinessConfig {
  business: {
    id: string;
    name: string;
    about: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    postalCode: string | null;
    taxNumber: string | null;
    registrationNo: string | null;
    logo: string | null;
    currency: string;
    timezone: string;
  };
  settings: {
    currency: string;
    timezone: string;
    language: string;
    allowNegativeStock: boolean;
    allowCreditSales: boolean;
    enableOfflineMode: boolean;
  } | null;
  receiptSettings: {
    businessName: string | null;
    businessAddress: string | null;
    businessPhone: string | null;
    footerMessage: string | null;
    showLogo: boolean;
    autoPrint: boolean;
    paperWidth: string;
  } | null;
  taxSettings: {
    taxName: string;
    taxPercentage: number | string;
    taxNumber: string | null;
    taxEnabled: boolean;
  } | null;
  notificationSettings: {
    lowStockAlert: boolean;
    lowStockLevel: number;
    dailySalesSummary: boolean;
    weeklySalesSummary: boolean;
    monthlySalesSummary: boolean;
    pushNotifications: boolean;
    emailNotifications: boolean;
  } | null;
}
