import { createConfiguredI18n, syncDocumentLanguage } from "./config";

const i18n = createConfiguredI18n();

syncDocumentLanguage(i18n);

export default i18n;
export * from "./config";
