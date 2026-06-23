import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";

import Register from "./Register";
import { createConfiguredI18n } from "../i18n";
import { useAuth } from "../context/AuthContext";

jest.mock("../context/AuthContext", () => ({
  useAuth: jest.fn(),
}));
jest.mock("react-router-dom", () => ({
  Link: ({ children, to }) => <a href={to}>{children}</a>,
  useNavigate: () => jest.fn(),
}), { virtual: true });

function renderRegister() {
  const i18n = createConfiguredI18n({ lng: "en" });
  return render(
    <I18nextProvider i18n={i18n}>
      <Register />
    </I18nextProvider>
  );
}

describe("Register page", () => {
  it("shows an informational message instead of the form when self-registration is disabled", () => {
    useAuth.mockReturnValue({
      register: jest.fn(),
      authOptions: {
        local_login_enabled: true,
        self_register_enabled: false,
        oidc: { enabled: false, display_name: null },
      },
    });

    renderRegister();

    expect(screen.getByTestId("register-disabled-message")).toBeInTheDocument();
    expect(screen.getByText("Self-registration is disabled for this workspace.")).toBeInTheDocument();
    expect(screen.queryByTestId("register-form")).not.toBeInTheDocument();
  });
});
