import { useState } from "react";

// This is a simple boolean toggle.
export default function useToggle(
  init: boolean = false
): [boolean, () => void] {
  const [val, setVal] = useState(init);
  const toggle = () => setVal(!val);
  return [val, toggle];
}
