/*
Hook that returns true when this is *definitely* being rendered on the frontend
in a browser.  Sometimes this is needed when whatever we render on the backend
can't be the same, e.g., due to loading some global state to window.

We use a real version under next.js and a trivial version in the frontend app,
since it otherwise causes horribly flicker problems under React 18 when
used with our frontend app.  Also, it's obviously silly and wasteful to use
this outside of next.js, since the entire motivation is SSR.
*/

import { useEffect, useState } from "react";

let useOnFrontend;
if (typeof process !== "undefined") {
  useOnFrontend = () => {
    const [frontend, setFrontend] = useState<boolean>(false);
    useEffect(() => setFrontend(true), []);
    return frontend;
  };
} else {
  useOnFrontend = () => true;
}

export default useOnFrontend;
