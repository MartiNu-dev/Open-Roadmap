import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";

import Login from "./Login";
import { createConfiguredI18n } from "../i18n";
import { useAuth } from "../context/AuthContext";

jest.mock("../context/AuthContext", () => ({
  useAuth: jest.fn(),
}));
jest.mock("react-router-dom", () => ({
  Link: ({ children, to }) => <a href={to}>{children}</a>,
  useNavigate: () => jest.fn(),
  useLocation: () => ({ state: null }),
}), { virtual: true });

function renderLogin() {
  const i18n = createConfiguredI18n({ lng: "en" });
  return render(
    <I18nextProvider i18n={i18n}>
      <Login />
    </I18nextProvider>
  );
}

describe("Login page", () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      login: jest.fn(),
      startOidcLogin: jest.fn(),
      authOptions: {
        local_login_enabled: true,
        self_register_enabled: true,
        oidc: { enabled: true, display_name: "Contoso SSO" },
      },
    });
  });

  it("renders the OIDC button and starts OIDC login with the current redirect target", () => {
    const startOidcLogin = jest.fn();
    useAuth.mockReturnValue({
      login: jest.fn(),
      startOidcLogin,
      authOptions: {
        local_login_enabled: true,
        self_register_enabled: true,
        oidc: { enabled: true, display_name: "Contoso SSO" },
      },
    });

    renderLogin();

    fireEvent.click(screen.getByTestId("login-oidc-btn"));

    expect(screen.getByText("Sign in with Contoso SSO")).toBeInTheDocument();
    expect(startOidcLogin).toHaveBeenCalledWith("/dashboard");
  });

  it("hides self-registration CTA when self-register is disabled", () => {
    useAuth.mockReturnValue({
      login: jest.fn(),
      startOidcLogin: jest.fn(),
      authOptions: {
        local_login_enabled: true,
        self_register_enabled: false,
        oidc: { enabled: false, display_name: null },
      },
    });

    renderLogin();

    expect(screen.getByText("Account creation is disabled. Please contact your administrator.")).toBeInTheDocument();
    expect(screen.queryByText("Create one")).not.toBeInTheDocument();
  });
});
