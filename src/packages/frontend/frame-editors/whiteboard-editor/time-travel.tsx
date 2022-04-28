/*
Viewer used by time travel to show whiteboard canvas at a particular point in time.
*/
import Canvas from "./canvas";
import NavigationPanel from "./tools/navigation";
import { useFrameContext } from "./hooks";
import ToolPanel from "./tools/panel";
import { ElementsMap } from "./types";
import { Map as iMap } from "immutable";
import { useRef } from "react";

export default function WhiteboardTimeTravel({ syncdb, version, font_size }) {
  const { isFocused, desc } = useFrameContext();
  const whiteboardDivRef = useRef<HTMLDivElement | null>(null);
  let elements = syncdb.version(version).get();
  // TODO: annoyingly, we need a map also in order to plot edges efficiently...
  let elementsMap: ElementsMap = iMap();
  for (const element of elements) {
    elementsMap = elementsMap.set(element.get("id"), element);
  }
  elements = elements.toJS();
  const selectedTool = desc.get("selectedTool") ?? "hand";
  return (
    <div className="smc-vfill" ref={whiteboardDivRef}>
      {isFocused && (
        <>
          <ToolPanel selectedTool={selectedTool} readOnly />
          <NavigationPanel
            fontSize={font_size}
            elements={elements}
            whiteboardDivRef={whiteboardDivRef}
          />
        </>
      )}
      <Canvas
        elementsMap={elementsMap}
        elements={elements}
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
