import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";

import AdminRoadmaps from "./AdminRoadmaps";
import { createConfiguredI18n } from "../i18n";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";

jest.mock("../context/AuthContext", () => ({
  useAuth: jest.fn(),
}));
jest.mock("@/components/Navbar", () => () => <div data-testid="navbar" />);
jest.mock("react-router-dom", () => ({
  Link: ({ to, children }) => <a href={to}>{children}</a>,
  Navigate: ({ to }) => <div data-testid="navigate" data-to={to} />,
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
      <AdminRoadmaps />
    </I18nextProvider>
  );
}

describe("AdminRoadmaps export", () => {
  const clickSpy = jest.fn();

  beforeEach(() => {
    const originalCreateElement = document.createElement.bind(document);

    useAuth.mockReturnValue({
      user: { id: "editor-1", role: "editor", email: "editor@example.com" },
      loading: false,
    });
    api.get.mockResolvedValue({
      data: [
        { id: "rm-1", slug: "frontend", title: "Frontend", description: "A", status: "draft", cover_emoji: "🗺️", tags: "", level: "mixed", block_count: 2 },
        { id: "rm-2", slug: "backend", title: "Backend", description: "B", status: "published", cover_emoji: "🗺️", tags: "", level: "mixed", block_count: 3 },
      ],
    });
    api.post.mockResolvedValue({
      data: new Blob(["{}"], { type: "application/json" }),
      headers: { "content-disposition": "attachment; filename=\"frontend.json\"" },
    });
    api.put.mockResolvedValue({ data: {} });
    api.patch.mockResolvedValue({ data: {} });
    api.delete.mockResolvedValue({});

    global.alert = jest.fn();
    window.URL.createObjectURL = jest.fn(() => "blob:test");
    window.URL.revokeObjectURL = jest.fn();
    clickSpy.mockReset();
    jest.spyOn(document, "createElement").mockImplementation((tagName) => {
      if (tagName === "a") {
        return {
          click: clickSpy,
          set href(value) { this._href = value; },
          get href() { return this._href; },
          set download(value) { this._download = value; },
          get download() { return this._download; },
        };
      }
      return originalCreateElement(tagName);
    });
    jest.spyOn(document.body, "appendChild").mockImplementation((node) => node);
    jest.spyOn(document.body, "removeChild").mockImplementation((node) => node);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it("exports a single roadmap as a blob download", async () => {
    renderPage();

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/admin/roadmaps");
    });

    fireEvent.click(screen.getByTestId("admin-export-roadmap-frontend"));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/admin/roadmaps/export", {
        roadmap_ids: ["rm-1"],
      }, {
        responseType: "blob",
      });
    });
    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
  });

  it("enables bulk export when roadmaps are selected", async () => {
    renderPage();

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/admin/roadmaps");
    });

    const exportSelectedButton = screen.getByTestId("admin-export-selected");
    expect(exportSelectedButton).toBeDisabled();

    fireEvent.click(screen.getByTestId("admin-select-roadmap-frontend"));
    fireEvent.click(screen.getByTestId("admin-select-roadmap-backend"));

    expect(exportSelectedButton).not.toBeDisabled();
    expect(screen.getByTestId("admin-selected-count")).toHaveTextContent("2 selected");

    fireEvent.click(exportSelectedButton);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/admin/roadmaps/export", {
        roadmap_ids: ["rm-1", "rm-2"],
      }, {
        responseType: "blob",
      });
    });
  });
});
