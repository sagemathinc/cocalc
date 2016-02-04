web0, web1, web2 face the internet and proxy traffic to other nodes.

This is the haproxy config to put on web0, web1, web2.  Don't put it on web3 or higher!  They don't even need to run haproxy, but you can have it there so you can directly connect to web3 for testing.

CRITICAL: if web3 doesn't exist but the haproxy refers to it, then haproxy will not start.  !!