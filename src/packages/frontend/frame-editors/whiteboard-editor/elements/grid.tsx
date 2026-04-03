/*
The background grid.
*/


const BIG_COLOR = "var(--cocalc-border-light, #f0f0f0)";
const SMALL_COLOR = "#f9f9f9";

// Grid spacing in data coordinates — shared with snap.ts for grid snapping
export const GRID_MAJOR = 100;
export const GRID_MINOR = 20;

const GRID_IMAGE = `linear-gradient(${BIG_COLOR} 1.5px, transparent 1.5px), linear-gradient(90deg, ${BIG_COLOR} 1.5px, transparent 1.5px), linear-gradient(${SMALL_COLOR} 1px, transparent 1px), linear-gradient(90deg, ${SMALL_COLOR} 1px, transparent 1px)`;
const GRID_SIZE = `${GRID_MAJOR}px ${GRID_MAJOR}px, ${GRID_MAJOR}px ${GRID_MAJOR}px, ${GRID_MINOR}px ${GRID_MINOR}px, ${GRID_MINOR}px ${GRID_MINOR}px`;

interface Props {
  transforms: { width: number; height: number; xMin: number; yMin: number };
  divRef?: any; // todo
}

export default function Grid({ transforms, divRef }: Props) {
  // Anchor grid to data-space origin (0,0) so grid lines are at
  // stable positions that match snap targets regardless of canvas extent.
  // The grid div starts at window position (0,0) which is data (xMin, yMin).
  // We offset the CSS background so lines land at data-space multiples.
  const majX = ((-transforms.xMin % GRID_MAJOR) + GRID_MAJOR) % GRID_MAJOR - 1.5;
  const majY = ((-transforms.yMin % GRID_MAJOR) + GRID_MAJOR) % GRID_MAJOR - 1.5;
  const minX = ((-transforms.xMin % GRID_MINOR) + GRID_MINOR) % GRID_MINOR - 1;
  const minY = ((-transforms.yMin % GRID_MINOR) + GRID_MINOR) % GRID_MINOR - 1;

  return (
    <div
      ref={divRef}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: `${transforms.width}px`,
        height: `${transforms.height}px`,
        backgroundImage: GRID_IMAGE,
        backgroundSize: GRID_SIZE,
        backgroundPosition: `${majX}px ${majY}px, ${majX}px ${majY}px, ${minX}px ${minY}px, ${minX}px ${minY}px`,
      }}
    ></div>
  );
}
