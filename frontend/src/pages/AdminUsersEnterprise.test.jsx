import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";

import AdminUsersEnterprise from "./AdminUsersEnterprise";
import { createConfiguredI18n } from "../i18n";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";

jest.mock("../context/AuthContext", () => ({
  useAuth: jest.fn(),
}));
jest.mock("react-router-dom", () => ({
  Navigate: ({ to }) => <div data-testid="navigate" data-to={to} />,
}), { virtual: true });
jest.mock("../lib/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  API_BASE: "http://backend.test/api",
  formatApiError: (err, fallback) => err?.response?.data?.detail || fallback || "error",
}));

function renderPage() {
  const i18n = createConfiguredI18n({ lng: "en" });
  return render(
    <I18nextProvider i18n={i18n}>
      <AdminUsersEnterprise />
    </I18nextProvider>
  );
}

describe("AdminUsersEnterprise", () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      user: { id: "admin-1", role: "admin", email: "admin@example.com" },
      loading: false,
      refreshAuthOptions: jest.fn().mockResolvedValue(undefined),
    });

    api.get.mockImplementation((url) => {
      if (url === "/admin/users") {
        return Promise.resolve({
          data: [{ id: "user-1", name: "Jane", email: "jane@example.com", role: "user" }],
        });
      }
      if (url === "/admin/auth/settings") {
        return Promise.resolve({
          data: {
            self_register_enabled: true,
            oidc_enabled: true,
            oidc_display_name: "Contoso SSO",
            oidc_issuer_url: "https://issuer.example.com",
            oidc_client_id: "roadmap-client",
            oidc_scopes: "openid profile email groups",
            oidc_email_claim: "email",
            oidc_name_claim: "name",
            oidc_role_claim: "groups",
            oidc_role_values_user: "roadmap-user",
            oidc_role_values_editor: "roadmap-editor",
            oidc_role_values_admin: "roadmap-admin",
            has_client_secret: true,
            secret_source: "database",
            configured: true,
          },
        });
      }
      if (url === "/admin/roadmap-visibility-settings") {
        return Promise.resolve({
          data: {
            editors_see_all_roadmaps: true,
            mappings: [
              { id: "map-1", role_name: "ABF", role_key: "abf", tags: "dev,nouveau" },
            ],
          },
        });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
    api.put.mockImplementation((url) => {
      if (url === "/admin/auth/settings") {
        return Promise.resolve({
          data: {
            self_register_enabled: false,
            oidc_enabled: true,
            editors_see_all_roadmaps: true,
            oidc_display_name: "Renamed SSO",
            oidc_issuer_url: "https://issuer.example.com",
            oidc_client_id: "roadmap-client",
            oidc_scopes: "openid profile email groups",
            oidc_email_claim: "email",
            oidc_name_claim: "name",
            oidc_role_claim: "groups",
            oidc_role_values_user: "roadmap-user",
            oidc_role_values_editor: "roadmap-editor",
            oidc_role_values_admin: "roadmap-admin",
            has_client_secret: true,
            secret_source: "database",
            configured: true,
          },
        });
      }
      if (url === "/admin/roadmap-visibility-settings") {
        return Promise.resolve({
          data: {
            editors_see_all_roadmaps: false,
            mappings: [
              { id: "map-1", role_name: "ABF", role_key: "abf", tags: "dev,nouveau" },
              { id: "map-2", role_name: "QA", role_key: "qa", tags: "qa" },
            ],
          },
        });
      }
      return Promise.reject(new Error(`Unexpected PUT ${url}`));
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("loads auth settings in the authentication tab and saves updates", async () => {
    const refreshAuthOptions = jest.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({
      user: { id: "admin-1", role: "admin", email: "admin@example.com" },
      loading: false,
      refreshAuthOptions,
    });

    renderPage();

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/admin/users");
      expect(api.get).toHaveBeenCalledWith("/admin/auth/settings");
      expect(api.get).toHaveBeenCalledWith("/admin/roadmap-visibility-settings");
    });

    fireEvent.click(screen.getByTestId("admin-tab-auth"));

    expect(screen.getByDisplayValue("Contoso SSO")).toBeInTheDocument();
    expect(screen.getByDisplayValue("http://backend.test/api/auth/oidc/callback")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Renamed SSO" } });
    fireEvent.click(screen.getByTestId("admin-auth-save-btn"));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith("/admin/auth/settings", expect.objectContaining({
        oidc_display_name: "Renamed SSO",
      }));
    });
    expect(refreshAuthOptions).toHaveBeenCalled();
    expect(screen.getByText("Authentication settings saved.")).toBeInTheDocument();
  });

  it("loads roadmap visibility settings and saves mappings", async () => {
    renderPage();

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/admin/roadmap-visibility-settings");
    });

    fireEvent.click(screen.getByTestId("admin-tab-auth"));

    expect(screen.getByDisplayValue("ABF")).toBeInTheDocument();
    expect(screen.getByDisplayValue("dev,nouveau")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("admin-visibility-add"));
    fireEvent.click(screen.getByTestId("admin-visibility-editors-see-all"));
    fireEvent.change(screen.getByTestId("admin-visibility-role-1"), { target: { value: "QA" } });
    fireEvent.change(screen.getByTestId("admin-visibility-tags-1"), { target: { value: "qa" } });
    fireEvent.click(screen.getByTestId("admin-visibility-save-btn"));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith("/admin/roadmap-visibility-settings", {
        editors_see_all_roadmaps: false,
        mappings: [
          { role_name: "ABF", tags: "dev,nouveau" },
          { role_name: "QA", tags: "qa" },
        ],
      });
    });

    expect(screen.getByText("Roadmap visibility settings saved.")).toBeInTheDocument();
  });
});
