import { Button } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";

export default function StartSlideshowButton({ divRef }) {
  if (document.fullscreenElement) {
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
      onClick={() => {
        divRef.current?.requestFullscreen();
      }}
    >
      <Icon name="play-square" /> Start Slideshow
    </Button>
  );
}
