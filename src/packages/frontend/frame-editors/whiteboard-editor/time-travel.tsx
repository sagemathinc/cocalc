/*
Viewer used by time travel to show whiteboard canvas at a particular point in time.
*/
import Canvas from "./canvas";
import NavigationPanel from "./tools/navigation";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

export default function WhiteboardTimeTravel({ syncdb, version, font_size }) {
  const { isFocused } = useFrameContext();
  const elements = syncdb.version(version).get().toJS();
  return (
    <div className="smc-vfill">
      {isFocused && (
        <NavigationPanel fontSize={font_size} elements={elements} />
      )}
      <Canvas elements={elements} font_size={font_size} margin={50} readOnly />
    </div>
  );
}
