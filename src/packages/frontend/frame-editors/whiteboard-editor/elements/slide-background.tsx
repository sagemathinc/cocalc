/*
The background area behind the slide.
*/

const SLIDE_BACKGROUND_COLOR = "#f8f9fa";

interface Props {
  transforms: { width: number; height: number };
  divRef?: any; // todo
}

export default function SlideBackground({ transforms, divRef }: Props) {
  return (
    <div
      ref={divRef}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: `${transforms.width}px`,
        height: `${transforms.height}px`,
        background: SLIDE_BACKGROUND_COLOR,
      }}
    ></div>
  );
}
