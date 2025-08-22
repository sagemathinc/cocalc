/*
Reusable component for selecting context cells around a target cell in Jupyter notebooks.
Used by both the LLM cell tool and AI cell generator.
*/

import { Flex, Slider, SliderSingleProps, Switch } from "antd";
import { useMemo } from "react";

import { Paragraph, Text } from "@cocalc/frontend/components";
import { NotebookFrameActions } from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/actions";

export interface LLMCellContextSelectorProps {
  // Context range as [above, below] where negative values mean "above" and positive mean "below"
  contextRange: [number, number];
  onContextRangeChange: (range: [number, number]) => void;

  // Cell types to include
  cellTypes: "all" | "code";
  onCellTypesChange: (types: "all" | "code") => void;

  // Current cell ID and frame actions for enumerating available cells
  currentCellId: string;
  frameActions: NotebookFrameActions | undefined;
}

export function LLMCellContextSelector({
  contextRange,
  onContextRangeChange,
  cellTypes,
  onCellTypesChange,
  currentCellId,
  frameActions,
}: LLMCellContextSelectorProps) {
  const { minValue, maxValue, marks } = useMemo(() => {
    const jupyterActionsStore = frameActions?.jupyter_actions.store;
    if (!jupyterActionsStore) {
      return { minValue: 0, maxValue: 0, marks: { 0: "0" } };
    }

    // Count all cells before the insertion point (include current cell and all above it)
    let cellsBefore = 0;
    while (jupyterActionsStore.get_cell_id(cellsBefore, currentCellId)) {
      cellsBefore++;
    }

    // start with the first cell after the current cell (+1 offset)
    let cellsAfter = 0;
    while (jupyterActionsStore.get_cell_id(cellsAfter + 1, currentCellId)) {
      cellsAfter++;
    }

    const minVal = -cellsBefore;
    const maxVal = cellsAfter;

    // Create marks dynamically
    const marks: SliderSingleProps["marks"] = { 0: "0" };

    // Only add boundary marks if they don't conflict with -2/+2
    if (minVal < -3) {
      marks[minVal] = "first";
    }
    if (maxVal > 3) {
      marks[maxVal] = "last";
    }

    // Add -2 and +2 marks only if they're not at the boundaries
    if (minVal < -2) {
      marks[-2] = "-2";
    }
    if (maxVal > 2) {
      marks[2] = "+2";
    }

    return { minValue: minVal, maxValue: maxVal, marks };
  }, [currentCellId, frameActions]);

  // clip range to be within bounds, just to be safe
  const adjustedRange: [number, number] = [
    Math.max(contextRange[0], minValue),
    Math.min(contextRange[1], maxValue),
  ];

  function getDescription() {
    return `Selected: ${Math.abs(
      adjustedRange[0],
    )} cells above including current cell + ${adjustedRange[1]} cells below`;
  }

  return (
    <>
      {/* Prevent clicks from bubbling to modal mask - fixes slider interactions closing modal */}
      <Paragraph onClick={(e) => e.stopPropagation()}>
        <Flex align="center" gap="10px">
          <Text>Context:</Text>
          <Slider
            range
            marks={marks}
            min={minValue}
            max={maxValue}
            step={1}
            value={adjustedRange}
            onChange={(value) =>
              onContextRangeChange(value as [number, number])
            }
            style={{ flex: 1, margin: "0 20px" }}
          />
        </Flex>
      </Paragraph>
      <Paragraph type="secondary">{getDescription()}</Paragraph>
      <Paragraph>
        <Flex align="center" gap="10px">
          <Flex flex={0}>
            <Switch
              checked={cellTypes === "all"}
              onChange={(val) => onCellTypesChange(val ? "all" : "code")}
              unCheckedChildren="Code cells"
              checkedChildren="All Cells"
            />
          </Flex>
          <Flex flex={1}>
            <Text type="secondary">
              Include only code cells, or all types of cells.
            </Text>
          </Flex>
        </Flex>
      </Paragraph>
    </>
  );
}
