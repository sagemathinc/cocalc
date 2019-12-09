const UI = "normal";

if (UI === "normal") {
  import("./webapp-async");
} else if (UI === "retention-optimized") {
  import("./retention-app");
}
