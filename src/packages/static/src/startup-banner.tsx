import * as React from "react";
// @ts-ignore -- this is a webpack thing, which confuses typescript.
import cocalc_word from "./cocalc-word.svg";
// @ts-ignore
import cocalc_circle from "./cocalc-circle.svg";
// @ts-ignore
import "./startup-banner.css";

export default function StartupBanner() {
  // The hook business below loads the custom logo via the customize
  // JSON endpoint, then updates the component and displays the
  // logo if still mounted.  We have to wrap the async calls in
  // an async function, since useEffect has to return a normal function.
  const isMountedRef = React.useRef<boolean>(true);
  const [logo, setLogo] = React.useState<string | undefined>(undefined);
  React.useEffect(() => {
    (async () => {
      let logo: string | undefined = undefined;
      try {
        // check for a custom logo
        logo = (await (await fetch("customize")).json())?.configuration
          ?.logo_rectangular;
      } catch (err) {
        console.log("WARNING: problem loading customize data", err);
      }
      if (logo && isMountedRef.current) {
        // got a logo and still mounted, so set the logo.
        setLogo(logo);
      }
    })();
    return () => {
      // component unmounted, so don't bother setting the logo.
      isMountedRef.current = false;
    };
  }, []);

  return (
    <div
      className="cocalc-fade-in"
      style={{
        height: "100vh",
        display: "flex",
        justifyContent: "center" /* horizontally center */,
        alignItems: "center" /* vertically center */,
      }}
    >
      {logo ? (
        <img src={logo} />
      ) : (
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
      )}
    </div>
  );
}
