import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";

import RoadmapDetail from "./RoadmapDetail";
import { createConfiguredI18n } from "../i18n";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";

const mockUseParams = jest.fn();

jest.mock("../context/AuthContext", () => ({
  useAuth: jest.fn(),
}));
jest.mock("@/components/Navbar", () => () => <div data-testid="navbar" />);
jest.mock("@/components/RoadmapCanvas", () => () => <div data-testid="roadmap-canvas" />);
jest.mock("@/components/BlockSidePanel", () => () => <div data-testid="block-side-panel" />);
jest.mock("@/components/LinkSidePanel", () => () => <div data-testid="link-side-panel" />);
jest.mock("react-router-dom", () => ({
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
  useParams: () => mockUseParams(),
}), { virtual: true });
jest.mock("../lib/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  formatApiError: (err, fallback) => err?.response?.data?.detail || fallback || "error",
}));

function renderPage() {
  const i18n = createConfiguredI18n({ lng: "en" });
  return render(
    <I18nextProvider i18n={i18n}>
      <RoadmapDetail />
    </I18nextProvider>
  );
}

describe("RoadmapDetail", () => {
  beforeEach(() => {
    mockUseParams.mockReturnValue({ slug: "draft-roadmap" });
    useAuth.mockReturnValue({
      user: { id: "editor-1", role: "editor", email: "editor@example.com" },
      authOptions: {
        local_login_enabled: true,
        self_register_enabled: true,
        oidc: { enabled: false, display_name: null },
      },
    });
    api.get.mockReset();
    api.post.mockReset();
    api.put.mockReset();
    api.patch.mockReset();
    api.delete.mockReset();
    global.alert = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders a draft roadmap for an editor and shows its status badge", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/admin/roadmaps/detail/draft-roadmap") {
        return Promise.resolve({
          data: {
            id: "rm-1",
            slug: "draft-roadmap",
            title: "Draft roadmap",
            description: "Hidden from the public",
            status: "draft",
            cover_emoji: "T",
            tags: "",
            level: "mixed",
            blocks: [],
            links: [],
          },
        });
      }
      if (url === "/progress/me/rm-1") {
        return Promise.resolve({ data: { items: [] } });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    renderPage();

    expect(screen.getByTestId("roadmap-loading")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("roadmap-title")).toHaveTextContent("Draft roadmap");
    });

    expect(screen.getByTestId("roadmap-status-badge")).toHaveTextContent("Draft");
    expect(screen.getByTestId("toggle-edit-mode-btn")).toBeInTheDocument();
    expect(screen.getByTestId("roadmap-canvas")).toBeInTheDocument();
  });

  it("shows a stable error state when the roadmap cannot be loaded", async () => {
    useAuth.mockReturnValue({
      user: null,
      authOptions: {
        local_login_enabled: true,
        self_register_enabled: true,
        oidc: { enabled: false, display_name: null },
      },
    });
    mockUseParams.mockReturnValue({ slug: "missing-roadmap" });
    api.get.mockRejectedValue({
      response: {
        data: {
          detail: "Roadmap not found",
        },
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("roadmap-error")).toBeInTheDocument();
    });

    expect(screen.getByText("Roadmap unavailable")).toBeInTheDocument();
    expect(screen.getByText("Roadmap not found")).toBeInTheDocument();
    expect(screen.queryByTestId("roadmap-loading")).not.toBeInTheDocument();
  });
});
