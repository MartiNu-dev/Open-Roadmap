import { useTranslation } from "react-i18next";

import { SUPPORTED_LANGUAGES } from "../i18n";

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation("common");
  const currentLanguage = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];

  return (
    <label className="flex items-center gap-2 text-xs text-slate-500">
      <span className="hidden sm:inline">{t("language.label")}</span>
      <select
        aria-label={t("language.label")}
        className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
        data-testid="language-switcher"
        value={currentLanguage}
        onChange={(event) => {
          i18n.changeLanguage(event.target.value);
        }}
      >
        {SUPPORTED_LANGUAGES.map((language) => (
          <option key={language} value={language}>
            {t(`language.${language}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
