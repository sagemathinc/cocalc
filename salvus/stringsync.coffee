#################################################################
#
# stringsync -- a node.js module that is used by the hub to provide
# a differential synchronized string, which is persisted and synchronized
# across hubs via the database itself.
#
#  (c) William Stein, 2014
#
# Here's a diagram:
#
# [dc0 database state] .... [dc1 database state] <-----> [*hub*] <---> clients...
#        /|\
#         |-----[hub] <--> clients...
#
# This hub views it's in-memory current state of the string as the ultimate
# upstream for the string.  It views the database as one single downstream client,
# and some connected browser clients as other downstream clients.
# We query the database to see if any hashes have changed. with one single
# query for *all* strings, so polling scales.
#
#################################################################





