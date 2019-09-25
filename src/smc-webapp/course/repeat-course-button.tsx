import * as React from "react";

export function RepeatCourseButton({ on_click }) {
  return <button onClick={_ => on_click()}>Repeat this course</button>;
}
