/*
The background grid.
*/

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
        background: "#f8f9fa",
      }}
    ></div>
  );
}
