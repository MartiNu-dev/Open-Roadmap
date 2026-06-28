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

    expect(screen.getByTestId("canvas-group-box-group-1")).toHaveStyle({
      background: "rgb(255, 255, 255)",
      borderColor: "rgb(239, 68, 68)",
      borderStyle: "dashed",
      borderWidth: "4px",
    });
  });
});
