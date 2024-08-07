/*
Create an immortal DOM node.  This is a way to render HTML that stays stable
irregardless of it being unmounted/remounted.
This supports virtualization, window splitting, etc., without loss of state.
*/

import { useCallback, useEffect, useRef } from "react";
import $ from "jquery";

// This is just an initial default height; the actual height of the should
// resize to the content.
const HEIGHT = "50vh";

interface Props {
  globalKey: string;
  html: string;
  zIndex?: number;
}

const immortals: { [globalKey: string]: any } = {};

const Z_INDEX = 1;

export default function ImmortalDomNode({
  globalKey,
  html,
  zIndex = Z_INDEX, // todo: support changing?
}: Props) {
  const divRef = useRef<any>(null);
  const eltRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);

  const position = useCallback(() => {
    // make it so eltRef.current is exactly positioned on top of divRef.current using CSS
    if (eltRef.current == null || divRef.current == null) {
      return;
    }
    const eltRect = eltRef.current.getBoundingClientRect();
    const divRect = divRef.current.getBoundingClientRect();
    let deltaTop = divRect.top - eltRect.top;
    if (deltaTop) {
      if (eltRef.current.style.top) {
        deltaTop += parseFloat(eltRef.current.style.top.slice(0, -2));
      }
      eltRef.current.style.top = `${deltaTop}px`;
    }
    let deltaLeft = divRect.left - eltRect.left;
    if (deltaLeft) {
      if (eltRef.current.style.left) {
        deltaLeft += parseFloat(eltRef.current.style.left.slice(0, -2));
      }
      eltRef.current.style.left = `${deltaLeft}px`;
    }
  }, []);

  useEffect(() => {
    if (divRef.current == null) {
      return;
    }
    let elt;
    if (immortals[globalKey] == null) {
      elt = immortals[globalKey] = $(
        `<div id="${globalKey}" style="border:0;overflow:hidden;width:100%;height:${HEIGHT};position:absolute;left:130px;z-index:${zIndex}"/>${html}</div>`,
      );
      $("body").append(elt);
    } else {
      elt = immortals[globalKey];
      elt.show();
    }
    eltRef.current = elt[0];
    intervalRef.current = setInterval(position, 1000);
    position();

    return () => {
      // unmounting so hide
      elt.hide();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={divRef}
      style={{ border: "1px solid black", height: HEIGHT }}
    ></div>
  );
}
