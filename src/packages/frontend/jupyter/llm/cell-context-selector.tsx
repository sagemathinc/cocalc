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

  // Current cell ID and frame actions for counting available cells
  currentCellId: string;
  frameActions: NotebookFrameActions | undefined;

  // For ai-cell-generator, the context is relative to where the new cell will be inserted
  // For cell-tool, the context is relative to the current cell
  mode: "current-cell" | "insert-position";
}

export function LLMCellContextSelector({
  contextRange,
  onContextRangeChange,
  cellTypes,
  onCellTypesChange,
  currentCellId,
  frameActions,
  mode,
}: LLMCellContextSelectorProps) {
  const { minValue, maxValue, marks } = useMemo(() => {
    const jupyterActionsStore = frameActions?.jupyter_actions.store;
    if (!jupyterActionsStore) {
      return { minValue: 0, maxValue: 0, marks: { 0: "0" } };
    }

    let minVal: number, maxVal: number;

    if (mode === "insert-position") {
      // For insert position, we need to count cells differently
      // Count all cells before the insertion point (include current cell and all above it)
      let cellsBefore = 0;
      let delta = 0; // Start from current cell (which will be "before" after insertion)
      while (jupyterActionsStore.get_cell_id(delta, currentCellId)) {
        cellsBefore++;
        delta--;
      }

      // Count cells after
      let cellsAfter = 0;
      delta = 1;
      while (jupyterActionsStore.get_cell_id(delta, currentCellId)) {
        cellsAfter++;
        delta++;
      }

      minVal = -cellsBefore;
      maxVal = cellsAfter;
    } else {
      // For current-cell mode, count cells above and below as before
      let cellsAbove = 0;
      let delta = -1;
      while (jupyterActionsStore.get_cell_id(delta, currentCellId)) {
        cellsAbove++;
        delta--;
      }

      // Count cells below
      let cellsBelow = 0;
      delta = 1;
      while (jupyterActionsStore.get_cell_id(delta, currentCellId)) {
        cellsBelow++;
        delta++;
      }

      minVal = -cellsAbove;
      maxVal = cellsBelow;
    }

    // Create marks dynamically
    const marks: SliderSingleProps["marks"] = {
      0: mode === "current-cell" ? "0" : "insert",
    };

    // Only add boundary marks if they don't conflict with -2/+2
    if (minVal < 0) {
      marks[minVal] = minVal === -2 ? "-2" : "first";
    }
    if (maxVal > 0) {
      marks[maxVal] = maxVal === 2 ? "+2" : "last";
    }

    // Add -2 and +2 marks only if they're not at the boundaries
    if (minVal < -2) {
      marks[-2] = "-2";
    }
    if (maxVal > 2) {
      marks[2] = "+2";
    }

    return { minValue: minVal, maxValue: maxVal, marks };
  }, [currentCellId, frameActions, mode]);

  // Adjust range to be within bounds
  const adjustedRange: [number, number] = [
    Math.max(contextRange[0], minValue),
    Math.min(contextRange[1], maxValue),
  ];

  const getDescription = () => {
    if (mode === "current-cell") {
      return `Selected: ${Math.abs(
        adjustedRange[0],
      )} cells above + current cell + ${adjustedRange[1]} cells below`;
    } else {
      // For insert position mode
      const beforeCount = Math.abs(adjustedRange[0]);
      const afterCount = adjustedRange[1];
      return `Selected: ${beforeCount} cells before insertion + ${afterCount} cells after insertion`;
    }
  };

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
