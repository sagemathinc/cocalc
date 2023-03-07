import { Button } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { redux } from "@cocalc/frontend/app-framework";
import {
  isFullscreen,
  requestFullscreen,
} from "@cocalc/frontend/misc/fullscreen";

export default function StartSlideshowButton({ divRef }) {
  if (isFullscreen() || redux.getStore("page").get("fullscreen")) {
    return null;
  }
  return (
    <Button
      size="large"
      style={{
        position: "absolute",
        left: "64px",
        top: "8px",
        zIndex: 100000,
        boxShadow: "0 0 5px grey",
      }}
      onClick={async () => {
        try {
          await requestFullscreen(divRef.current);
        } catch (_) {
          // a very mildly useful fallback, e.g., on maybe an iphone?  Kind of pointless,
          // except it gets rid of the "Start slideshow" button and puts things in a better position.
          redux.getActions("page")?.set_fullscreen("default");
        }
      }}
    >
      <Icon name="play-square" /> Start Slideshow
    </Button>
  );
}
