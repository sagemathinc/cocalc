// disable the pool for testing since it leaves kernels
// around after testing, and we don't need it for tests.
process.env.COCALC_JUPYTER_POOL_SIZE = 0;
