import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";

import RoadmapCanvas from "./RoadmapCanvas";
import { createConfiguredI18n } from "../i18n";

function renderCanvas(props) {
  const i18n = createConfiguredI18n({ lng: "en" });
  return render(
    <I18nextProvider i18n={i18n}>
      <RoadmapCanvas {...props} />
    </I18nextProvider>
  );
}

function buildRoadmap(visibilityMode = "transparent", overrides = {}) {
  return {
    id: "rm-1",
    blocks: [
      {
        id: "group-1",
        roadmap_id: "rm-1",
        title: "Hidden anchor",
        short_description: "",
        detailed_content: "",
        level: "",
        estimated_duration: "",
        order_index: 1,
        x: 120,
        y: 80,
        width: 240,
        height: 120,
        node_style: "primary",
        kind: "group",
        visibility_mode: visibilityMode,
        bg_color: "#0f172a",
        border_color: "#94a3b8",
        border_style: "solid",
        border_thickness: "small",
        label_position: "top",
        label_align: "center",
        resources: [],
        ...overrides,
      },
    ],
    links: [],
  };
}

function buildCheckboxRoadmap(overrides = {}) {
  return {
    id: "rm-1",
    blocks: [
      {
        id: "checkbox-1",
        roadmap_id: "rm-1",
        title: "Ship authentication improvements without regressions",
        short_description: "",
        detailed_content: "",
        level: "",
        estimated_duration: "",
        order_index: 1,
        x: 120,
        y: 80,
        width: 320,
        height: 64,
        node_style: "primary",
        kind: "checkbox",
        visibility_mode: "visible",
        bg_color: "#0f172a",
        border_color: "#94a3b8",
        border_style: "solid",
        border_thickness: "small",
        label_position: "bottom",
        label_align: "center",
        checkbox_color: "#111827",
        text_color: "#0f172a",
        font_size: "lg",
        label_side: "left",
        resources: [],
        ...overrides,
      },
    ],
    links: [],
  };
}

function buildTextRoadmap(overrides = {}) {
  return {
    id: "rm-1",
    blocks: [
      {
        id: "text-1",
        roadmap_id: "rm-1",
        title: "First line\nSecond line with a little more content",
        short_description: "",
        detailed_content: "",
        level: "",
        estimated_duration: "",
        order_index: 1,
        x: 160,
        y: 120,
        width: 260,
        height: 80,
        node_style: "label",
        kind: "text",
        visibility_mode: "visible",
        bg_color: "#0f172a",
        border_color: "#94a3b8",
        border_style: "solid",
        border_thickness: "small",
        label_position: "bottom",
        label_align: "justify",
        checkbox_color: "#111827",
        text_color: "#1d4ed8",
        font_size: "custom",
        font_size_px: 22,
        label_side: "right",
        resources: [],
        ...overrides,
      },
    ],
    links: [],
  };
}

function buildLinkedRoadmap() {
  return {
    id: "rm-1",
    blocks: [
      {
        id: "block-1",
        roadmap_id: "rm-1",
        title: "Start",
        short_description: "",
        detailed_content: "",
        level: "",
        estimated_duration: "",
        order_index: 1,
        x: 120,
        y: 80,
        width: 220,
        height: 60,
        node_style: "primary",
        kind: "block",
        resources: [],
      },
      {
        id: "block-2",
        roadmap_id: "rm-1",
        title: "Finish",
        short_description: "",
        detailed_content: "",
        level: "",
        estimated_duration: "",
        order_index: 2,
        x: 420,
        y: 220,
        width: 220,
        height: 60,
        node_style: "primary",
        kind: "block",
        resources: [],
      },
    ],
    links: [
      {
        id: "link-1",
        from_block_id: "block-1",
        to_block_id: "block-2",
        style: "solid",
        thickness: "medium",
        color: "#475569",
        from_side: "bottom",
        to_side: "top",
        label: "",
      },
    ],
  };
}

describe("RoadmapCanvas transparent groups", () => {
  it("stays invisible and non-clickable in viewer mode", () => {
    const onSelectBlock = jest.fn();

    renderCanvas({
      roadmap: buildRoadmap(),
      progressByBlock: {},
      isEditor: false,
      editMode: false,
      onSelectBlock,
    });

    fireEvent.click(screen.getByTestId("canvas-group-group-1"));

    expect(onSelectBlock).not.toHaveBeenCalled();
    expect(screen.queryByText("Hidden anchor")).not.toBeInTheDocument();
    expect(screen.queryByTestId("canvas-group-ghost-group-1")).not.toBeInTheDocument();
  });

  it("shows editing affordances for transparent groups in edit mode", () => {
    const onSelectBlock = jest.fn();

    renderCanvas({
      roadmap: buildRoadmap(),
      progressByBlock: {},
      isEditor: true,
      editMode: true,
      onSelectBlock,
    });

    fireEvent.click(screen.getByTestId("canvas-group-group-1"));

    expect(onSelectBlock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("canvas-group-ghost-group-1")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-group-label-group-1")).toHaveTextContent("Hidden anchor");
    expect(screen.getByTestId("anchor-top-group-1")).toBeInTheDocument();
    expect(screen.getByTestId("resize-se-group-1")).toBeInTheDocument();
  });

  it("renders configured borders for visible groups", () => {
    renderCanvas({
      roadmap: buildRoadmap("visible", {
        bg_color: "#ffffff",
        border_color: "#ef4444",
        border_style: "dashed",
        border_thickness: "large",
      }),
      progressByBlock: {},
      isEditor: false,
      editMode: false,
      onSelectBlock: jest.fn(),
    });

    const groupBox = screen.getByTestId("canvas-group-box-group-1");
    expect(groupBox).toHaveStyle({ background: "rgb(255, 255, 255)" });
    expect(groupBox.style.borderColor).toBe("#ef4444");
    expect(groupBox.style.borderStyle).toBe("dashed");
    expect(groupBox.style.borderWidth).toBe("4px");
  });
});

describe("RoadmapCanvas checkbox blocks", () => {
  it("toggles a checkbox in viewer mode without opening the side panel", () => {
    const onSelectBlock = jest.fn();
    const onToggleCheckbox = jest.fn();

    renderCanvas({
      roadmap: buildCheckboxRoadmap(),
      progressByBlock: {},
      isEditor: false,
      editMode: false,
      onSelectBlock,
      onToggleCheckbox,
    });

    fireEvent.click(screen.getByTestId("canvas-checkbox-checkbox-1"));

    expect(onToggleCheckbox).toHaveBeenCalledTimes(1);
    expect(onSelectBlock).not.toHaveBeenCalled();
  });

  it("opens checkbox configuration in editor mode and hides link anchors", () => {
    const onSelectBlock = jest.fn();
    const onToggleCheckbox = jest.fn();

    renderCanvas({
      roadmap: buildCheckboxRoadmap(),
      progressByBlock: {},
      isEditor: true,
      editMode: true,
      onSelectBlock,
      onToggleCheckbox,
    });

    fireEvent.click(screen.getByTestId("canvas-checkbox-checkbox-1"));

    expect(onSelectBlock).toHaveBeenCalledTimes(1);
    expect(onToggleCheckbox).not.toHaveBeenCalled();
    expect(screen.queryByTestId("anchor-top-checkbox-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("resize-se-checkbox-1")).toBeInTheDocument();
  });

  it("renders left-side checkbox text with wrapping classes and completed styling", () => {
    renderCanvas({
      roadmap: buildCheckboxRoadmap(),
      progressByBlock: { "checkbox-1": { status: "completed" } },
      isEditor: false,
      editMode: false,
      onSelectBlock: jest.fn(),
      onToggleCheckbox: jest.fn(),
    });

    expect(screen.getByTestId("checkbox-label-checkbox-1")).toHaveClass("text-right", "whitespace-normal", "break-words", "line-through");
    const checkboxBox = screen.getByTestId("checkbox-box-checkbox-1");
    expect(checkboxBox.style.borderColor).toBe("#111827");
    expect(checkboxBox.style.backgroundColor).toBe("rgb(17, 24, 39)");
  });

  it("shows add-checkbox actions in editor toolbar and context menu", () => {
    renderCanvas({
      roadmap: buildCheckboxRoadmap(),
      progressByBlock: {},
      isEditor: true,
      editMode: true,
      onSelectBlock: jest.fn(),
      onToggleCheckbox: jest.fn(),
      onAddCheckboxAt: jest.fn(),
    });

    expect(screen.getByTestId("editor-add-checkbox-btn")).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByTestId("roadmap-canvas"));

    expect(screen.getByTestId("ctx-add-checkbox")).toBeInTheDocument();
  });
});

describe("RoadmapCanvas text blocks", () => {
  it("renders free text without opening anything in viewer mode", () => {
    const onSelectBlock = jest.fn();

    renderCanvas({
      roadmap: buildTextRoadmap(),
      progressByBlock: {},
      isEditor: false,
      editMode: false,
      onSelectBlock,
    });

    fireEvent.click(screen.getByTestId("canvas-text-text-1"));

    expect(onSelectBlock).not.toHaveBeenCalled();
    expect(screen.getByTestId("text-content-text-1")).toHaveStyle({
      color: "rgb(29, 78, 216)",
      textAlign: "justify",
      fontSize: "22px",
    });
  });

  it("opens text configuration in editor mode and exposes resize handles", () => {
    const onSelectBlock = jest.fn();

    renderCanvas({
      roadmap: buildTextRoadmap(),
      progressByBlock: {},
      isEditor: true,
      editMode: true,
      onSelectBlock,
    });

    fireEvent.click(screen.getByTestId("canvas-text-text-1"));

    expect(onSelectBlock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("resize-se-text-1")).toBeInTheDocument();
  });

  it("shows add-text actions in editor toolbar and context menu", () => {
    renderCanvas({
      roadmap: buildTextRoadmap(),
      progressByBlock: {},
      isEditor: true,
      editMode: true,
      onSelectBlock: jest.fn(),
      onAddTextAt: jest.fn(),
    });

    expect(screen.getByTestId("editor-add-text-btn")).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByTestId("roadmap-canvas"));

    expect(screen.getByTestId("ctx-add-text")).toBeInTheDocument();
  });
});

describe("RoadmapCanvas links", () => {
  it("does not open link configuration in viewer mode", () => {
    const onSelectLink = jest.fn();

    renderCanvas({
      roadmap: buildLinkedRoadmap(),
      progressByBlock: {},
      isEditor: true,
      editMode: false,
      onSelectBlock: jest.fn(),
      onSelectLink,
    });

    const linkHitArea = screen.getByTestId("canvas-links").querySelector('path[stroke="transparent"]');

    expect(linkHitArea).not.toBeNull();
    expect(linkHitArea.getAttribute("class")).toContain("cursor-default");

    fireEvent.click(linkHitArea);

    expect(onSelectLink).not.toHaveBeenCalled();
  });

  it("opens link configuration in editor mode", () => {
    const onSelectLink = jest.fn();

    renderCanvas({
      roadmap: buildLinkedRoadmap(),
      progressByBlock: {},
      isEditor: true,
      editMode: true,
      onSelectBlock: jest.fn(),
      onSelectLink,
    });

    const linkHitArea = screen.getByTestId("canvas-links").querySelector('path[stroke="transparent"]');

    expect(linkHitArea).not.toBeNull();
    expect(linkHitArea.getAttribute("class")).toContain("cursor-pointer");

    fireEvent.click(linkHitArea);

    expect(onSelectLink).toHaveBeenCalledTimes(1);
    expect(onSelectLink).toHaveBeenCalledWith(expect.objectContaining({ id: "link-1" }));
  });
});
