// test/setup.js

// see packages/database/pool/pool.ts for where this name is also hard coded:
process.env.PGDATABASE = "smc_ephemeral_testing_database";
process.env.PGTZ = "UTC";

const originalWarn = console.warn;
console.warn = (...args) => {
  const [firstArg] = args;
  if (
    typeof firstArg === "string" &&
    firstArg.includes("Cannot use a pool after calling end on the pool")
  ) {
    return;
  }
  originalWarn(...args);
};
