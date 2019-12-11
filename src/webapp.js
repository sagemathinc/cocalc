const APP = "retention";

async function loadOld() {
  const m = await import("./webapp-smc");
  m.run();
}

async function loadNew() {
  const m = await import("./smc-webapp/index.retention");
  m.run({escape: loadOld});
}

if (APP === "retention") {
  loadNew();
} else {
  loadOld();
}
