# Cloudflare + GCE Load Balancing

This is our setup regarding cloudflare and GCE's load balancing.

## Problem

In the fully SMC setup, there are N front-facing nodes running haproxy. They deal with incoming TCP traffic on port 80/443 → see haproxy config. Cloudflare is a reverse DNS proxy, which does forward traffic to SMC. Cloudflare (or even usual DNS entries) do not have any idea, if the machine, where incoming IP traffic is forwarded to, is alive or not.

## Solution

Use GCE's load balancer for network traffic (TCP, layer 4), to forward only to those front-end haproxies, which are alive and healthy. They'll then do the cookie-based layer 7 load balancing across the hubs.

## Setup

1. Target pools. This is a static list of GCE instances, which are handling traffic. Currently, that's set to be web0, 1 and 2.

   (In the future, this could be dynamic, based on CPU usage, using instance templates or even containers, etc.)

       gcloud compute target-pools describe lb-1

   Documentation: https://cloud.google.com/compute/docs/load-balancing/network/target-pools

2. Health Checks: Each haproxy instance has a health endpoint `/health-check` on port 60000 (not forwarded from the outside through the firewall, but accessible internally), that's being used to check if it is working. Therefore, a health check is created, to test every 2 secs if it runs, and fails after 2 consecutive fails, etc.

   haproxy config snippet

        frontend health
            bind *:60000
            monitor-uri /health-check

   GCE health check:

   In my first setup, it checks every 2 seconds, and it's dead if it fails two times,
   and alive if ok after 2 tests. So, it toggles in less than 5 seconds.
   (So, iff at least one haproxy is always alive, assuming daily restarts that gives an uptime ratio of 9-nines -- 1 - 100 * (5secs/24hours)^3)

       gcloud compute http-health-checks describe lb-1-health-check

   Documentation: https://cloud.google.com/compute/docs/load-balancing/health-checks

   PS: GCE network firewall rule:

       default-allow-health-check	0.0.0.0/0	tcp:60000	http-server

3. Finally, to make this work, we need an external static IP address and forwarding rules. There are two rules, for port 80 and 443:

       gcloud compute forwarding-rules describe lb-1-forwarding-rule
       gcloud compute forwarding-rules describe lb-1-forwarding-rule-2

4. Actually check health:

        >>> gcloud compute target-pools get-health lb-1
        ---
        healthStatus:
        - healthState: HEALTHY
          instance: https://www.googleapis.com/compute/v1/projects/sage-math-inc/zones/us-central1-c/instances/web0
          ipAddress: 146.148.109.227
        kind: compute#targetPoolInstanceHealth
        ---
        healthStatus:
        - healthState: HEALTHY
          instance: https://www.googleapis.com/compute/v1/projects/sage-math-inc/zones/us-central1-c/instances/web1
          ipAddress: 146.148.109.227
        kind: compute#targetPoolInstanceHealth
        ---
        healthStatus:
        - healthState: HEALTHY
          instance: https://www.googleapis.com/compute/v1/projects/sage-math-inc/zones/us-central1-c/instances/web2
          ipAddress: 146.148.109.227
        kind: compute#targetPoolInstanceHealth

---

All this can be configured via

https://console.cloud.google.com/networking/loadbalancing/list

checks for the target pool:

https://console.cloud.google.com/networking/loadbalancing/advanced/targetPools/details/regions/us-central1/targetPools/lb-1

---

## Ideas for the future

### graceful shutdown of haproxy

To gracefully shutdown/restart an instance, use iptables to temporarily block the alive check. Existing TCP connections will stay connected, while no others will be created. After some time, cut off the remaining ones and proceed with a shutdown.

https://cloud.google.com/compute/docs/load-balancing/health-checks#handling_unhealthy_instances

### add haproxy health information

pretty much what is here:

https://cbonte.github.io/haproxy-dconv/configuration-1.6.html#4.2-monitor%20fail