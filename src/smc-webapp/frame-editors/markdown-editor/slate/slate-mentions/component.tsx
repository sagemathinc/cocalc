/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MIT (same as slate uses https://github.com/ianstormtaylor/slate/blob/master/License.md)
 */

// Adapted from https://github.com/ianstormtaylor/slate/blob/master/site/examples/mentions.tsx

import * as React from "react";
import * as ReactDOM from "react-dom";
import { CSSProperties } from "react";

const STYLE = {
  top: "-9999px",
  left: "-9999px",
  position: "absolute",
  zIndex: 1,
  padding: "3px",
  background: "white",
  borderRadius: "4px",
  boxShadow: "0 1px 5px rgba(0,0,0,.2)",
} as CSSProperties;

interface Props {
  chars: string[];
  index: number;
  divref;
}

export const Mentions: React.FC<Props> = ({ chars, index, divref }) => {
  const users = chars.map((char, i) => (
    <div
      key={char}
      style={{
        padding: "1px 3px",
        borderRadius: "3px",
        background: i === index ? "#B4D5FF" : "transparent",
      }}
    >
      {char}
    </div>
  ));
  return (
    <Portal>
      <div ref={divref} style={STYLE}>
        {users}
      </div>
    </Portal>
  );
};

export const Portal = ({ children }) => {
  return ReactDOM.createPortal(children, document.body);
};
