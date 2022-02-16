/*
Version of our canvas that is very simple, fast and meant for backend rendering.

NOTE: This is probably also useful for printing.
*/

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import { Button, Tooltip } from "antd";
import { Element } from "../types";
import Grid from "../elements/grid";
import Render from "../elements/render-static";
import { getPosition, getTransforms, Transforms } from "../math";
import Position from "../position";
import { ColumnWidthOutlined } from "@ant-design/icons";

interface Props {
  elements: Element[];
}

export default function Canvas({ elements }: Props) {
  const canvasRef = useRef<any>(null);
  const [canvasScale, setCanvasScale] = useState<number>(1);
  const margin = 20;
  const transforms = useMemo<Transforms>(
    () => getTransforms(elements, margin, canvasScale),
    [elements, margin, canvasScale]
  );
  const fitToView = () => {
    if (elements.length == 0) return;
    const c = canvasRef.current;
    if (c == null) return;
    const rect = c.getBoundingClientRect();
    if (rect == null) return;
    setCanvasScale(
      Math.min(rect.height / transforms.height, rect.width / transforms.width)
    );
  };

  useEffect(() => {
    fitToView();
  }, []);

  const navButtons = (
    <div
      style={{
        textAlign: "center",
        margin: "-10px 0 10px 0",
      }}
    >
      <div
        style={{
          border: "1px solid #aaa",
          boxShadow: "1px 3px 5px",
          display: "inline-block",
        }}
      >
        <Tooltip title="Fit to view" placement="bottom">
          <Button type="text" onClick={fitToView}>
            <ColumnWidthOutlined />
          </Button>
        </Tooltip>
        <Tooltip title="Zoom out" placement="bottom">
          <Button
            type="text"
            onClick={() => {
              setCanvasScale(canvasScale * 0.9);
            }}
          >
            <Icon name="search-minus" />
          </Button>
        </Tooltip>
        <Tooltip title="Zoom in" placement="bottom">
          <Button
            type="text"
            onClick={() => {
              setCanvasScale(canvasScale * 1.1);
            }}
          >
            <Icon name="plus" />
          </Button>
        </Tooltip>
        <Tooltip title="Zoom in" placement="bottom">
          <Button
            type="text"
            onClick={() => {
              setCanvasScale(1);
            }}
          >
            {Math.round(100 * canvasScale)}%
          </Button>
        </Tooltip>
      </div>
    </div>
  );
  return (
    <div>
      {navButtons}

      <div
        ref={canvasRef}
        style={{
          width: "100%",
          height: "70vh",
          overflow: "auto",
          border: "1px solid #ccc",
          borderRadius: "5px",
          boxShadow: "1px 3px 5px",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "relative",
            transform: `scale(${canvasScale})`,
            transformOrigin: "top left",
            height: `calc(${canvasScale * 100}%)`,
          }}
        >
          <Grid transforms={transforms} />
          {elements.map((element) => {
            const { x, y, z, w, h } = getPosition(element);
            const t = transforms.dataToWindowNoScale(x, y, z);
            return (
              <Position key={element.id} {...t} w={w} h={h}>
                <Render element={element} canvasScale={canvasScale} />
              </Position>
            );
          })}
        </div>
      </div>
    </div>
  );
}
