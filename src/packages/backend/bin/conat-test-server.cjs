/*
Starts a node for testing and benchmarking.  It has no auth or security, and is just meant
for unit testing and benchmarking purposes.
*/
for(const name of ['PORT', 'BASE_PATH', 'CONAT_SERVER', 'COCALC_PROJECT_ID']) {
    delete process.env[name];
}
const { initConatServer } = require("@cocalc/backend/conat/test/setup");
const { setConatServer } = require("@cocalc/backend/data");

async function main() {
    const clusterName = process.argv[2];
    const server = await initConatServer({
       id: "0",
       clusterName,
       systemAccountPassword: "test",
    });
    console.log("ADDRESS: ", server.address())
    setConatServer(server.address())
}

main();


