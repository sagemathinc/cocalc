// test/setup.js

// see packages/database/pool/pool.ts for where this name is also hard coded:
process.env.PGDATABASE = "smc_ephemeral_testing_database";

// checked for in some code to behave differently while running unit tests.
process.env.COCALC_TEST_MODE = true;

delete process.env.CONAT_SERVER;
