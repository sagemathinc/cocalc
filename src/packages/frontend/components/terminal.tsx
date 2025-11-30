/*
Easy React Terminal display output.

TODO: NOT FINISHED/USED YET!
*/

import { useEffect, useRef } from "react";
import { Terminal as Terminal0 } from "@xterm/xterm";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { setTheme } from "@cocalc/frontend/frame-editors/terminal-editor/themes";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { handleLink } from "@cocalc/frontend/frame-editors/terminal-editor/connected-terminal";

const WIDTH = 160;
const HEIGHT = 40;

interface Options {
  value?: string;
  scrollback?: number;
  width?: number;
  height?: number;
  style?;
  scrollToBottom?: boolean;
}

export default function Terminal({
  value = "",
  scrollback = 1_000_000,
  width = WIDTH,
  height = HEIGHT,
  style,
  scrollToBottom = true,
}: Options) {
  const { font_size, font, color_scheme } = useTypedRedux(
    "account",
    "terminal",
  )?.toJS() ?? { font: "monospace", font_size: 13, color_scheme: "default" };
  const eltRef = useRef<any>(null);
  const termRef = useRef<any>(null);

  useEffect(() => {
    const elt = eltRef.current;
    if (elt == null) {
      return;
    }
    const term = new Terminal0({
      fontSize: font_size,
      fontFamily: font,
      scrollback,
    });
    term.loadAddon(new WebLinksAddon(handleLink));
    //term.loadAddon(new FitAddon());
    termRef.current = term;
    setTheme(term, color_scheme);
    term.resize(width, height);
    term.open(elt);
    term.write(value);
    if (scrollToBottom) {
      term.scrollToBottom();
    }

    return () => {
      term.dispose();
    };
  }, [scrollback, width, height, font_size, font, color_scheme]);

  useEffect(() => {
    termRef.current?.write(value);
    if (scrollToBottom) {
      termRef.current?.scrollToBottom();
    }
  }, [value, scrollToBottom]);

  return (
    <div
      style={{
        overflow: "auto",
        ...style,
      }}
    >
      <pre
        ref={eltRef}
        style={{
          width: `${WIDTH + 20}ex`,
          padding: 0,
        }}
      ></pre>
    </div>
  );
}
