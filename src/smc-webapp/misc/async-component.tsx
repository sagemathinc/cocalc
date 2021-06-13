/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Use this to make it so a React component that defined by some asyncronous call or
import can be used by client code as if it was not asynchronous.  What happens
is that the component first renders as "Loading...", then loads asynchronously,
and then the true component is rendered.

To use this, pass an async function in that returns the component when awaited, e.g.,
instead of

    import { TimeTravel } from "./time-travel";

You would do write the following:

    const TimeTravel = AsyncComponent(
      async () => (await import("./time-travel")).TimeTravel
    );

You can then use TimeTravel wherever, and the actual code only gets
loaded when you first instantiate the component.
*/

import * as React from "react";
const { useEffect, useRef, useState } = React;
import { useIsMountedRef } from "smc-webapp/app-framework/hooks";

export function AsyncComponent(f: () => Promise<any>) {
  return (props) => {
    const [isLoaded, setIsLoaded] = useState<boolean>(false);
    const componentRef = useRef<any>(null);
    const isMountedRef = useIsMountedRef();

    useEffect(() => {
      (async () => {
        const C = await f();
        if (isMountedRef.current) {
          componentRef.current = C;
          setIsLoaded(true);
        }
      })();
    }, []);

    if (isLoaded && componentRef.current != null) {
      return <componentRef.current {...props} />;
    } else {
      return <div>Loading...</div>;
    }
  };
}
