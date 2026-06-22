import i18next from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import commonEn from "./en/common.json";
import authEn from "./en/auth.json";
import dashboardEn from "./en/dashboard.json";
import adminEn from "./en/admin.json";
import roadmapsEn from "./en/roadmaps.json";
import commonFr from "./fr/common.json";
import authFr from "./fr/auth.json";
import dashboardFr from "./fr/dashboard.json";
import adminFr from "./fr/admin.json";
import roadmapsFr from "./fr/roadmaps.json";

export const LOCALE_STORAGE_KEY = "open-roadmap.locale";
export const SUPPORTED_LANGUAGES = ["en", "fr"];
export const DEFAULT_LANGUAGE = "en";
export const NAMESPACES = ["common", "auth", "roadmaps", "dashboard", "admin"];

export const resources = {
  en: {
    common: commonEn,
    auth: authEn,
    dashboard: dashboardEn,
    admin: adminEn,
    roadmaps: roadmapsEn,
  },
  fr: {
    common: commonFr,
    auth: authFr,
    dashboard: dashboardFr,
    admin: adminFr,
    roadmaps: roadmapsFr,
  },
};

export function createConfiguredI18n(options = {}) {
  const instance = i18next.createInstance();

  instance.use(LanguageDetector).use(initReactI18next);
  instance.init({
    resources,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    defaultNS: "common",
    ns: NAMESPACES,
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ["localStorage"],
    },
    initImmediate: false,
    ...options,
  });

  return instance;
}

export function syncDocumentLanguage(instance) {
  if (typeof document === "undefined") return () => {};

  const updateLanguage = (lng) => {
    document.documentElement.lang = (lng || DEFAULT_LANGUAGE).split("-")[0];
  };

  updateLanguage(instance.resolvedLanguage || instance.language);
  instance.on("languageChanged", updateLanguage);

  return () => {
    instance.off("languageChanged", updateLanguage);
  };
}
