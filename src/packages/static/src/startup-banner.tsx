import * as React from "react";
// @ts-ignore -- this is a webpack thing, which confuses typescript.
import cocalc_word from "./cocalc-word.svg";
// @ts-ignore
import cocalc_circle from "./cocalc-circle.svg";
// @ts-ignore
import "./startup-banner.css";

export default function StartupBanner() {
  return (
    <div
      style={{
        height: "100vh",
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
          height: "75vh",
          width: "90%",
        }}
      >
        <img
          src={cocalc_circle}
          className={"cocalc-spin"}
          style={{
            height: "70%",
            width: "100%",
          }}
        />
        <br />
        <img
          src={cocalc_word}
          style={{
            height: "30%",
            width: "100%",
          }}
        />
      </div>
    </div>
  );
}
