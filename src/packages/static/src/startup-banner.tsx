/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/* The startup banner

If you want to develop this, edit packages/frontend/app/render.tsx as indicated there so the
startup banner doesn't vanish.
*/

// @ts-ignore -- this is a webpack thing, which confuses typescript.
import cocalc_word from "./cocalc-word.svg";
// @ts-ignore
import cocalc_circle from "./cocalc-circle.svg";
import useCustomize from "./customize";
import "./startup-banner.css";

export function TestBanner() {
  return <StartupBanner />;
}

export default function StartupBanner() {
  const customize = useCustomize();

  return (
    <div
      className="cocalc-fade-in"
      style={{
        left: 0,
        top: 0,
        zIndex: 100,
        height: "100vh",
        width: "100vw",
        position: "fixed",
        display: "flex",
        justifyContent: "center" /* horizontally center */,
        alignItems: "center" /* vertically center */,
      }}
    >
      {customize.logo_rectangular ? (
        <img style={{ maxWidth: "50%" }} src={customize.logo_rectangular} />
      ) : (
        <div
          style={{
            backgroundColor: "#4474c0",
            borderRadius: "5px",
            padding: "15px",
            height: "75vh",
            width: "90%",
            maxWidth: "300px",
            maxHeight: "300px",
            textAlign: "center",
          }}
        >
          <img
            src={cocalc_circle}
            className={"cocalc-spin"}
            style={{
              height: "70%",
              maxWidth: "75%",
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
      )}
    </div>
  );
}
