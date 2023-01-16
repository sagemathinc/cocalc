/*
Viewer used by time travel to show whiteboard canvas at a particular point in time.
*/
import Canvas from "./canvas";
import NavigationPanel from "./tools/navigation";
import { useFrameContext } from "./hooks";
import ToolPanel from "./tools/panel";
import { Element, ElementsMap } from "./types";
import { Map as iMap } from "immutable";
import { useEffect, useMemo, useRef } from "react";
import { DEFAULT_PAGE_ID } from "./actions";

export default function WhiteboardTimeTravel({ syncdb, version, font_size }) {
  const { id, isFocused, desc, actions } = useFrameContext();
  const whiteboardDivRef = useRef<HTMLDivElement | null>(null);
  let elements = syncdb.version(version).get();
  // TODO: annoyingly, we need a map also in order to plot edges efficiently...
  let elementsMap: ElementsMap = iMap();
  for (const element of elements) {
    elementsMap = elementsMap.set(element.get("id"), element);
  }

  useEffect(() => {
    let pages = 0;
    let firstPage = DEFAULT_PAGE_ID;
    elementsMap.forEach((element) => {
      if (element.get("type") == "page") {
        if (firstPage == DEFAULT_PAGE_ID) {
          firstPage = element.get("id");
        }
        pages += 1;
      }
    });
    if (desc.get("pages") == null || desc.get("pages") < pages) {
      actions.setPages(id, pages);
    }
    if (desc.get("page") == null) {
      actions.setPage(id, firstPage);
    }
  }, [elementsMap]);

  const elementsOnPage = useMemo(() => {
    const page = desc.get("page") ?? DEFAULT_PAGE_ID;
    const v: Element[] = [];
    elementsMap.forEach((element) => {
      if ((element.get("page") ?? DEFAULT_PAGE_ID) == page) {
        v.push(element.toJS());
      }
    });
    return v;
  }, [elementsMap, desc.get("page") ?? DEFAULT_PAGE_ID]);

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
            fontSize={font_size}
            elements={elementsOnPage}
            whiteboardDivRef={whiteboardDivRef}
          />
        </>
      )}
      <Canvas
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
