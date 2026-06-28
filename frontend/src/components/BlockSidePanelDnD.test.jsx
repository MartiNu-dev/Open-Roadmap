import { act, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";

import BlockSidePanelDnD from "./BlockSidePanelDnD";
import { createConfiguredI18n } from "../i18n";

function renderPanel(props = {}) {
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
        {...props}
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
