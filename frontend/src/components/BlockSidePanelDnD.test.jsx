import { act, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }) => <div>{children}</div>,
}));
jest.mock("remark-gfm", () => ({
  __esModule: true,
  default: {},
}));

import BlockSidePanelDnD from "./BlockSidePanelDnD";
import { createConfiguredI18n } from "../i18n";

function renderPanel(props = {}) {
  const { block: blockOverrides = {}, ...restProps } = props;
  const i18n = createConfiguredI18n({ lng: "en" });
  const block = {
    id: "group-1",
    roadmap_id: "rm-1",
    title: "Visible group",
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
    visibility_mode: "visible",
    bg_color: "#ffffff",
    border_color: "#94a3b8",
    border_style: "solid",
    border_thickness: "small",
    label_position: "top",
    label_align: "center",
    resources: [],
    checkbox_color: "#111827",
    text_color: "#0f172a",
    font_size: "base",
    font_size_px: null,
    label_side: "right",
    ...blockOverrides,
  };
  const onSave = jest.fn();

  const view = render(
    <I18nextProvider i18n={i18n}>
      <BlockSidePanelDnD
        open
        onOpenChange={() => {}}
        block={block}
        progress={null}
        onStatusChange={() => {}}
        canEdit
        canManage
        onSave={onSave}
        onDelete={() => {}}
        saving={false}
        onAddResource={() => {}}
        onUpdateResource={() => {}}
        onDeleteResource={() => {}}
        onReorderResources={() => {}}
        {...restProps}
      />
    </I18nextProvider>
  );

  return { ...view, onSave };
}

describe("BlockSidePanelDnD group borders", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("renders border controls and autosaves border changes", () => {
    const { onSave } = renderPanel();

    expect(screen.getByTestId("group-border-presets")).toBeInTheDocument();
    expect(screen.getByTestId("group-border-style-solid")).toBeInTheDocument();
    expect(screen.getByTestId("group-border-thickness-small")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("group-border-style-dotted"));
    fireEvent.click(screen.getByTestId("group-border-thickness-large"));
    fireEvent.change(screen.getByTestId("group-border-picker"), { target: { value: "#ef4444" } });

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      border_style: "dotted",
      border_thickness: "large",
      border_color: "#ef4444",
    }));
  });
});

describe("BlockSidePanelDnD checkbox editor", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("renders checkbox controls and autosaves checkbox changes", () => {
    const { onSave } = renderPanel({
      block: {
        id: "checkbox-1",
        title: "Checkbox node",
        kind: "checkbox",
      },
    });

    expect(screen.getByTestId("checkbox-editor-form")).toBeInTheDocument();
    expect(screen.getByTestId("edit-checkbox-title")).toBeInTheDocument();
    expect(screen.getByTestId("edit-checkbox-color")).toBeInTheDocument();
    expect(screen.getByTestId("edit-checkbox-text-color")).toBeInTheDocument();
    expect(screen.getByTestId("edit-checkbox-font-size")).toBeInTheDocument();
    expect(screen.getByTestId("edit-checkbox-label-side")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("edit-checkbox-title"), { target: { value: "Checkbox updated" } });
    fireEvent.change(screen.getByTestId("edit-checkbox-color"), { target: { value: "#ef4444" } });
    fireEvent.change(screen.getByTestId("edit-checkbox-text-color"), { target: { value: "#2563eb" } });
    fireEvent.change(screen.getByTestId("edit-checkbox-font-size"), { target: { value: "xl" } });
    fireEvent.change(screen.getByTestId("edit-checkbox-label-side"), { target: { value: "left" } });

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      title: "Checkbox updated",
      checkbox_color: "#ef4444",
      text_color: "#2563eb",
      font_size: "xl",
      label_side: "left",
    }));
  });
});

describe("BlockSidePanelDnD text editor", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("renders text controls and autosaves free-text changes", () => {
    const { onSave } = renderPanel({
      block: {
        id: "text-1",
        title: "Initial text",
        kind: "text",
        label_align: "left",
        text_color: "#0f172a",
        font_size: "base",
        font_size_px: null,
      },
    });

    expect(screen.getByTestId("text-editor-form")).toBeInTheDocument();
    expect(screen.getByTestId("edit-text-content")).toBeInTheDocument();
    expect(screen.getByTestId("edit-text-color")).toBeInTheDocument();
    expect(screen.getByTestId("edit-text-align")).toBeInTheDocument();
    expect(screen.getByTestId("edit-text-font-size")).toBeInTheDocument();
    expect(screen.getByTestId("edit-text-font-size-px")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("edit-text-content"), { target: { value: "Updated free text" } });
    fireEvent.change(screen.getByTestId("edit-text-color"), { target: { value: "#2563eb" } });
    fireEvent.change(screen.getByTestId("edit-text-align"), { target: { value: "justify" } });
    fireEvent.change(screen.getByTestId("edit-text-font-size"), { target: { value: "custom" } });
    fireEvent.change(screen.getByTestId("edit-text-font-size-px"), { target: { value: "28" } });

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      title: "Updated free text",
      text_color: "#2563eb",
      label_align: "justify",
      font_size: "custom",
      font_size_px: 28,
    }));
  });
});
