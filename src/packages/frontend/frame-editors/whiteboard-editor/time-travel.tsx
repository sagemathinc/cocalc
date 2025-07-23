/*
Viewer used by time travel to show whiteboard canvas at a particular point in time.
*/
import Canvas from "./canvas";
import NavigationPanel from "./tools/navigation";
import { useFrameContext } from "./hooks";
import ToolPanel from "./tools/panel";
import { Element, ElementsMap } from "./types";
import { Map as iMap } from "immutable";
import { useMemo, useRef } from "react";
import { field_cmp } from "@cocalc/util/misc";

export default function WhiteboardTimeTravel({
  doc,
  font_size,
  mainFrameType,
}) {
  const { id, isFocused, desc, actions } = useFrameContext();
  const whiteboardDivRef = useRef<HTMLDivElement>(null as any);
  let elements = doc.get();
  // TODO: annoyingly, we need a map also in order to plot edges efficiently...
  let elementsMap: ElementsMap = iMap();
  for (const element of elements) {
    elementsMap = elementsMap.set(element.get("id"), element);
  }

  const pageIds: string[] = useMemo(() => {
    const v: { id: string; pos: number }[] = [];
    elementsMap.forEach((element) => {
      if (element.get("type") == "page") {
        v.push({
          id: element.get("id"),
          pos: element.getIn(["data", "pos"], 0),
        });
      }
    });
    v.sort(field_cmp("pos"));
    const numPages = v.length;

    if (desc.get("pages") == null || desc.get("pages") != numPages) {
      actions.setPages(id, numPages);
    }
    const pageIds = v.map((x) => x.id);
    if (desc.get("page") == null) {
      actions.setPage(id, 1);
    }
    if (desc.get("page") > numPages) {
      actions.setPage(id, numPages);
    }
    return pageIds;
  }, [elementsMap]);

  const elementsOnPage = useMemo(() => {
    const pageId = pageIds[desc.get("page", 1) - 1] ?? pageIds[0];
    const v: Element[] = [];
    elementsMap.forEach((element) => {
      if (element.get("page") == pageId) {
        v.push(element.toJS());
      }
    });
    return v;
  }, [elementsMap, desc.get("page")]);

  const selectedTool = desc.get("selectedTool") ?? "hand";
  return (
    <div
      className="smc-vfill"
      ref={whiteboardDivRef}
      style={{ position: "relative" }}
    >
      {isFocused && (
        <>
          <ToolPanel selectedTool={selectedTool} readOnly />
          <NavigationPanel
            mainFrameType={mainFrameType}
            fontSize={font_size}
            elements={elementsOnPage}
            whiteboardDivRef={whiteboardDivRef}
          />
        </>
      )}
      <Canvas
        mainFrameType={mainFrameType}
        elementsMap={elementsMap}
        elements={elementsOnPage}
        font_size={font_size}
        margin={50}
        readOnly
        selectedTool={selectedTool}
        selection={
          selectedTool == "select"
            ? new Set(desc.get("selection")?.toJS() ?? [])
            : undefined
        }
      />
    </div>
  );
}
