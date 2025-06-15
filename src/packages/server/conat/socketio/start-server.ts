/*

To start this:

    pnpm conat-server
    
Environment variables:

- CONAT_PORT    - port to listen on
*/

import { init as createConatServer } from "@cocalc/conat/core/server";

const DEFAULT_PORT = 3000;

const port = parseInt(process.env.CONAT_PORT ?? `${DEFAULT_PORT}`);

console.log("* CONATS *");
console.log(`http://localhost:${port}`);

createConatServer({ port, logger: console.log });
