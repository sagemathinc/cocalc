/*
Displays focused element with a border around it.

NOTE that this is HTML and border width must be at least 1px.
Given our CSS scale before this, if the scale is bigger than 2
then the border will be too wide.  We'll probably have to redo
things to fix that later.
*/

const padding = 15;
const thickness = 2;
const color = "#40a9ff";

export default function Focused({ children, scale }) {
  scale = scale ?? 1;
  return (
    <div
      style={{
        border: `${thickness / scale}px dashed ${color}`,
        padding: `${padding / scale}px`,
        marginLeft: `${(-padding - thickness) / scale}px`, // to offset border and padding, so object
        marginTop: `${(-padding - thickness) / scale}px`, // doesn't appear to move when selected
      }}
    >
      {children}
    </div>
  );
}
