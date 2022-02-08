/*
Viewer used by time travel to show whiteboard at a particular point in time.
*/
import Elements from "./elements";

export default function WhiteboardTimeTravel({ syncdb, version, font_size }) {
  const elements = syncdb.version(version).get().toJS();
  return <Elements elements={elements} font_size={font_size} />;
}
