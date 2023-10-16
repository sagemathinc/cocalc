// foreground; otherwise, return false.
export function should_open_in_foreground(
  e?:
    | React.MouseEvent
    | React.KeyboardEvent
    | MouseEvent
    | KeyboardEvent
    | null,
): boolean {
  if (e == null) {
    return true;
  }
  // for react.js synthetic mouse events, where e.which is undefined!
  if (isSyntheticMouseEvent(e)) {
    e = e.nativeEvent;
  }
  //console.log("e: #{e}, e.which: #{e.which}", e)
  return !(e.which === 2 || e.metaKey || e.altKey || e.ctrlKey);
}

function isSyntheticMouseEvent(e): e is React.MouseEvent {
  return e.constructor.name === "SyntheticMouseEvent";
}
