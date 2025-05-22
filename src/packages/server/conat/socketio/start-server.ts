/*

To start this:

    pnpm conat-server
    
Environment variables:

- CONAT_PORT    - port to listen on
*/

import { init as createConatServer } from "@cocalc/conat/core/server";
import { Server } from "socket.io";

const DEFAULT_PORT = 3000;

const port = parseInt(process.env.CONAT_PORT ?? `${DEFAULT_PORT}`);

console.log("* CONATS *");
console.log(`http://localhost:${port}`);

createConatServer({ port, Server, logger: console.log });
