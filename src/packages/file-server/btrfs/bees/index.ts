/*
Automate running BEES on the btrfs pool.  

Given:

- path to a btrfs filesystem 
- max memory usage (basically the hash table size) 
- max cpu usage 

DOES THE FOLLOWING: 

- creates properly the subvolume and table file (according to 
  table size above), if they don't already exist. 
- runs bees with that btrfs filesystem not exceeding the
  given cpu/memory usage so long as the container is running.

This uses a container that we build.


mountpoint:string

    truncate -s 1g "$BEESHOME/beeshash.dat"
    chmod 700 "$BEESHOME/beeshash.dat"

export BEESHOME=/root/.bees
bees -g 4 /
*/

import { spawn } from "node:child_process";

interface Options {
  loadavgTarget?: number;
  verbose?: number;
}

export default async function bees(mountpoint: string, opts?: Options) {}
