import * as React from "react";
// @ts-ignore -- this is a webpack thing, which confuses typescript.
import cocalc_icon_white_transparent from "webapp-lib/cocalc-icon-white-transparent.svg";

export default function StartupBanner() {
  return (
    <div
      style={{
        height: "90vh",
        display: "flex",
        justifyContent: "center" /* horizontally center */,
        alignItems: "center" /* vertically center */,
      }}
    >
      <div
        style={{
          backgroundColor: "#4474c0",
          borderRadius: "5px",
          padding: "15px",
        }}
      >
        <img
          src={cocalc_icon_white_transparent}
          style={{
            height: "50vh",
            maxWidth: "100%",
          }}
        />
      </div>
    </div>
  );
}
