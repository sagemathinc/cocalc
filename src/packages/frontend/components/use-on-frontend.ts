/*
Hook that returns true when this is *definitely* being rendered on the frontend
in a browser.  Sometimes this is needed when whatever we render on the backend
can't be the same, e.g., due to loading some global state to window.
*/

import { useEffect, useState } from "react";

export default function useOnFrontend() {
  const [frontend, setFrontend] = useState<boolean>(false);
  useEffect(() => setFrontend(true), []);
  return frontend;
}
