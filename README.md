# ![logo](https://raw.githubusercontent.com/sagemathinc/smc/master/src/webapp-lib/favicon-48.png) SageMathCloud (SMC)

#### _A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal_

## Website

   * [SageMathCloud](https://cloud.sagemath.com) -- the online service
   * [Github](https://github.com/sagemathinc/smc)
   * [Mailing list](https://groups.google.com/forum/#!forum/sage-cloud)
   * [Developer mailing list](https://groups.google.com/forum/#!forum/sage-cloud-devel)

## Evaluation install

To quickly evaluate SMC on your own machine, you can **[run a Docker image](https://github.com/sagemathinc/smc/blob/master/src/dev/docker/README.md)**.

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

... and *many* others: See https://github.com/sagemathinc/smc/graphs/contributors

## Copyright/License

The copyright of SMC is owned by SageMath, Inc., and the source code
here is released under the GNU Affero General Public License version 3+.
See the included file LICENSE.md.

None of the frontend or server dependencies of SMC are themselves GPL
licensed; they all have non-viral liberal licenses.   If want to host
your own SMC at a company, and need a different AGPL-free license,
please contact help@sagemath.com.

## ARCHITECTURE

  * Client       -- javascript client library that runs in web browser
  * Load balancer/ssl -- HAproxy
  * Database     -- PostgreSQL
  * Compute      -- VM's running TCP servers (e.g., sage, console, projects, python3, R, etc.)
  * Hub          -- written in Node.js; primus server; connects with *everything* -- compute servers, database, other hubs, and clients.
  * Storage      -- Snapshots of project data
  * HTTP server  -- Nginx

### Architectural Diagram
<pre>

   Client    Client    Client   Client  ...
     /|\
      |
   https://cloud.sagemath.com (primus)
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

</pre>


## Development installation

The following instruction **don't** install SMC. They're for development purposes only!

   * `git clone https://github.com/sagemathinc/smc` -- copy repo
   * `cd smc/src`
   * `npm run install-all` -- build
   * `npm test` -- run test suite (expected failures if your clock is not UTC)
   * `install.py all --compute --web` -- build and install some parts system-wide for development use
   * See `INSTALL.md` for more details.

For further options please [go here](https://github.com/sagemathinc/smc/tree/master/src/dev).
