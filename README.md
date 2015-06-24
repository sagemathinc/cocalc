# ![logo](https://cloud.sagemath.com/favicon-48.png) SageMathCloud (SMC)

## _A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal_

## Website

   * [SageMathCloud](https://cloud.sagemath.com)
   * [Github](https://github.com/sagemathinc/smc)
   * [Developer mailing list](https://groups.google.com/forum/#!forum/sage-cloud-devel)

## Contributors

   * William Stein, SageMath Inc and University of Washington -- founder; coding and design
   * Harald Schilly, Vienna, Austria -- marketing, QA, coding
   * Jon Lee, University of Washington -- frontend work, history viewer
   * Rob Beezer, University of Puget Sound -- design, maintenance
   * Nicholas Ruhland, University of Washington -- frontend work, tab reordering and resizing
   * Keith Clawson -- hardware/infrastructure
   * Andy Huchala, University of Washington -- frontend work, bug finding

## Copyright/License

SMC is 100% open source, released under the GNU General Public License version 3+:

    Copyright (C) 2014, 2015, William Stein

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.


## Build Status: Testing and Coverage

We test SMC via [Travis CI](https://travis-ci.org).
Here are the results for important branches:

* [master](https://github.com/sagemathinc/smc/):
  [![Build Status](https://travis-ci.org/sagemathinc/smc.svg?branch=master)](https://travis-ci.org/sagemathinc/smc)
  [![Coverage Status](https://coveralls.io/repos/sagemathinc/smc/badge.svg)](https://coveralls.io/r/sagemathinc/smc)

* [rethinkdb](https://github.com/sagemathinc/smc/tree/rethinkdb):
  [![Build Status](https://travis-ci.org/sagemathinc/smc.svg?branch=rethinkdb)](https://travis-ci.org/sagemathinc/smc?branch=rethinkdb)
  [![Coverage Status](https://coveralls.io/repos/sagemathinc/smc/badge.svg?branch=rethinkdb)](https://coveralls.io/r/sagemathinc/smc?branch=rethinkdb)


DevOps note: The relevant files are:

* .travis.yml - to tell travis-ci what to do (two modes: client and server)
* salvus/test/mocha.opts - defaults for running mocha
* salvus/package.json - the "scripts" section (overwrite mocha reporter, only call `coveralls` when on travis-ci, etc.)
* salvus/coffee-coverage-loader.js - configuration for the istanbul coffeescript coverage (server side)

## Dependencies

See the file `build.py`.

### Python

   * python-daemon -- http://pypi.python.org/pypi/python-daemon/; Python license, and will go into Python eventually
   * paramiko -- http://www.lag.net/paramiko/; ssh2 implementation in python
   * cql -- interface to Cassandra database

### Javascript/CSS/HTML

   * CoffeeScript -- all our Javascript is written using CoffeeScript
   * jQuery, jQuery-ui -- http://jquery.org/; MIT license
   * twitter bootstrap -- apache license
   * codemirror2 -- http://codemirror.net/; basically MIT license
   * jquery activity indicator -- MIT license
   * Primus
   * and many, many more!

### NodeJS

   * Many, many npm modules; see build.py

### Database

   * Cassandra -- Apache licensed

### Other Relevant Software

   * Linux -- SMC is only designed to be run on Linux (GPL v2)
   * tinc  -- VPN software; http://www.tinc-vpn.org/; GPL v2+
   * Git   -- http://git-scm.com/; GPL v2
   * Sage  -- http://sagemath.org/; GPL v3+; this is linked by sage_server.py, which thus must be GPL'd
   * ZFS   -- filesystem; CDL license

## ARCHITECTURE

  * VPN          -- tinc; P2P vpn; connects all computers at all sites into one unified network address space with secure communication
  * SSL          -- stunnel
  * Client       -- javascript client library that runs in web browser
  * Load balancer-- HAproxy
  * Database     -- Cassandra; distributed, NoSQL, fault tolerant, P2P
  * Compute      -- VM's running TCP servers (e.g., sage, console, projects, python3, R, etc.); stores all project data using ZFS.
  * Hub          -- written in Node.js; primus server; connects with *everything* -- compute servers, Cassandra DB, other hubs, and clients.
  * HTTP server  -- Nginx static http server
  * admin.py     -- Python program that uses the paramiko library to start/stop everything
  * Private Cloud-- (mostly) kvm virtual machines in various places
  * Public Cloud -- Google Compute Engine

### Architectural Diagram
<pre>

   Client    Client    Client   Client  ...
     /|\
      |
   https://cloud.sagemath.com (stunnel, primus)
      |
      |
     \|/
 HAproxy (load balancing...)HAproxy                  Admin     (monitor and control system)
 /|\       /|\      /|\      /|\
  |         |        |        |
  |http1.1  |        |        |
  |         |        |        |
 \|/       \|/      \|/      \|/
 Hub<----> Hub<---->Hub<---> Hub  <-----------> Cassandra <--> Cassandra  <--> Cassandra ...
           /|\      /|\      /|\
            |        |        |
   ---------|        |        | (tcp)
   |                 |        |
   |                 |        |
  \|/               \|/      \|/
 Compute<-------->Compute<-->Compute <--- rsync replication  to Storage Server, which has BTRFS snapshots

</pre>





