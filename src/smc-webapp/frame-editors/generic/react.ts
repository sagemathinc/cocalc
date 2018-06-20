// THIS SHOULD BE MOVED OUT OF frame-editors/


export const {
  React,
  ReactDOM,
  rclass,
  rtypes,
  Fragment,
  redux,
  Redux
} = require("smc-webapp/smc-react");

import * as ReactOrig from "react";

export const Component = ReactOrig.Component;

export type Rendered = ReactOrig.ReactElement<any> | undefined;
