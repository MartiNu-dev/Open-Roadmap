import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider, useTranslation } from "react-i18next";

import LanguageSwitcher from "./LanguageSwitcher";
import { createConfiguredI18n, LOCALE_STORAGE_KEY } from "../i18n";
import { getLevelLabel } from "../i18n/formatters";

function renderWithI18n(ui, i18n) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe("localization", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window.navigator, "language", {
      value: "en-US",
      configurable: true,
    });
    Object.defineProperty(window.navigator, "languages", {
      value: ["en-US", "en"],
      configurable: true,
    });
  });

  it("uses the browser locale on first load", () => {
    Object.defineProperty(window.navigator, "language", {
      value: "fr-FR",
      configurable: true,
    });
    Object.defineProperty(window.navigator, "languages", {
      value: ["fr-FR", "fr"],
      configurable: true,
    });

    const i18n = createConfiguredI18n();

    function Probe() {
      const { t } = useTranslation("common");
      return <div>{t("nav.login")}</div>;
    }

    renderWithI18n(<Probe />, i18n);

    expect(screen.getByText("Connexion")).toBeInTheDocument();
  });

  it("switches language and persists the selection", async () => {
    const i18n = createConfiguredI18n({ lng: "en" });

    renderWithI18n(<LanguageSwitcher />, i18n);

    fireEvent.change(screen.getByTestId("language-switcher"), {
      target: { value: "fr" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("language-switcher")).toHaveValue("fr");
    });
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("fr");
  });

  it("renders translated enum labels without changing the underlying value", () => {
    const i18n = createConfiguredI18n({ lng: "fr" });

    function EnumProbe() {
      const { t } = useTranslation();
      return (
        <select aria-label="level">
          <option value="beginner">{getLevelLabel(t, "beginner")}</option>
        </select>
      );
    }

    renderWithI18n(<EnumProbe />, i18n);

    expect(screen.getByRole("option")).toHaveTextContent("Débutant");
    expect(screen.getByRole("option")).toHaveValue("beginner");
  });
});
