import { useEffect, useState } from "react";

export default function Engage() {
  const [body, setBody] = useState<any>(null);
  useEffect(() => {
    // @ts-ignore
    window.DEBUG = true;
    (async () => {
      const Stopwatch = (
        await import("@cocalc/frontend/editors/stopwatch/stopwatch")
      ).default;
      console.log("loaded Stopwatch", Stopwatch);
      setBody(
        <Stopwatch
          state="running"
          time={new Date().valueOf()}
          clickButton={(btn) => console.log("clicked", btn)}
        />
      );
    })();
  }, []);
  return (
    <div style={{ margin: "30px", border: "1px solid grey", padding: "30px" }}>
      <h1>Example of testing backend vs frontend code splitting.</h1>
      <br />
      {body}
    </div>
  );
}
