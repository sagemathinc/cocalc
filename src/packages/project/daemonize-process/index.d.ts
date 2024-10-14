// BSD 2-clause

import { SpawnOptions } from 'node:child_process';

type DaemonizeProcessOpts = {
    /** The path to the script to be executed. Default: The current script. */
    script?: string;
    /** The command line arguments to be used. Default: The current arguments. */
    arguments?: string[];
    /** The path to the Node.js binary to be used. Default: The current Node.js binary. */
    node?: string;
    /** The exit code to be used when exiting the parent process. Default: `0`. */
    exitCode?: number;
} & SpawnOptions;
export declare function daemonizeProcess(opts?: DaemonizeProcessOpts): void;
export {};
