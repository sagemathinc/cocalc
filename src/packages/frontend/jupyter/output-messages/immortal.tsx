import { useCallback, useEffect, useRef } from "react";
import $ from "jquery";

// This is just an initial default height; the actual height of the iframe should
// resize to the content.
const HEIGHT = "70vh";

interface Props {
  key: string;
  html: string;
}

const immortals: { [key: string]: any } = {};

export default function Immortal({ key, html }: Props) {
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
    if (immortals[key] == null) {
      elt = immortals[key] = $(
        `<div style="border:0;overflow:hidden;width:100%;height:${HEIGHT};position:absolute;left:130px"/>${html}</div>`,
      );
      $("body").append(elt);
    } else {
      elt = immortals[key];
      elt.show();
    }
    eltRef.current = elt[0];
    intervalRef.current = setInterval(position, 500);

    return () => {
      // unmounting so hide
      elt.hide();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return <div ref={divRef} />;
}
