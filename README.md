# ![logo](https://raw.githubusercontent.com/sagemathinc/cocalc/master/src/webapp-lib/favicon-32x32.png) CoCalc

#### _Collaborative Calculations Online_

**CoCalc** offers collaborative calculations in the cloud.
This includes working with the full (scientific) Python stack, SageMath, Julia, R, Octave, and more.
It also offers capabilities to author documents in LaTeX, R/knitr or Markdown,
storing and organizing files, a web-based Linux Terminal,
communication tools like a chat, course management and more.

## Website

   * **[CoCalc](https://cocalc.com) -- the online service**
   * [Github](https://github.com/sagemathinc/cocalc)
   * **[Mailing List](https://groups.google.com/forum/#!forum/cocalc)**
   * [SMC mailing list](https://groups.google.com/forum/#!forum/sage-cloud)
   * [Developer mailing list](https://groups.google.com/forum/#!forum/sage-cloud-devel)

## Evaluation install

To quickly evaluate SMC on your own machine, you can **[run a Docker image](https://github.com/sagemathinc/cocalc/blob/master/src/dev/docker/README.md)**.

## History

*CoCalc* was formerly called *SageMathCloud*.
It started to offer way more than just SageMath and hence outgrew itself.
The name was coined in fall 2016 and changed around spring 2017.

## Contributors

### Current very active contributors

   * Tim Clemans
   * John Jeng
   * William Stein
   * Harald Schilly
   * Hal Snyder

### Past contributors

   * Greg Bard
   * Rob Beezer
   * Keith Clawson
   * Andy Huchala
   * Jon Lee
   * Simon Luu
   * Nicholas Ruhland
   * Todd Zimmerman

... and *many* others: See https://github.com/sagemathinc/cocalc/graphs/contributors

## Copyright/License

The copyright of CoCalc is owned by SageMath, Inc., and the source code
here is released under the GNU Affero General Public License version 3+.
See the included file LICENSE.md.

None of the frontend or server dependencies of SMC are themselves GPL
licensed; they all have non-viral liberal licenses.   If want to host
your own SMC at a company, and need a different AGPL-free license,
please contact help@sagemath.com.

## Trademark

"CoCalc" is a registered trademark.

## ARCHITECTURE

  * Client       -- javascript client library that runs in web browser
  * Load balancer/ssl -- HAproxy
  * Database     -- PostgreSQL
  * Compute      -- VM's running TCP servers (e.g., sage, console, projects, python3, R, etc.)
  * Hub          -- written in Node.js; primus server; connects with *everything* -- compute servers, database, other hubs, and clients.
  * Storage      -- Snapshots of project data
  * HTTP server  -- Nginx

### Architectural Diagram
```

   Client    Client    Client   Client  ...
     /|\
      |
   https://cocalc.com (primus)
      |
      |
     \|/
 HAproxy (load balancing...)HAproxy                  Admin     (monitor and control system)
 /|\       /|\      /|\      /|\
  |         |        |        |
  |http1.1  |        |        |
  |         |        |        |
 \|/       \|/      \|/      \|/
 Hub<----> Hub<---->Hub<---> Hub  <-----------> PostgreSQL <--> PostgreSQL  <--> PostgreSQL ...
           /|\      /|\      /|\
            |        |        |
   ---------|        |        | (tcp)
   |                 |        |
   |                 |        |
  \|/               \|/      \|/
 Compute<-------->Compute<-->Compute <--- rsync replication  to Storage Server, which has ZFS snapshots

```


## Development installation

The following instruction **don't** install SMC. They're for development purposes only!

   * `git clone https://github.com/sagemathinc/cocalc` -- copy repo
   * `cd cocalc/src`
   * `npm run install-all` -- build
   * `npm test` -- run test suite (expected failures if your clock is not UTC)
   * `install.py all --compute --web` -- build and install some parts system-wide for development use
   * See `INSTALL.md` for more details.

For further options please [go here](https://github.com/sagemathinc/cocalc/tree/master/src/dev).
