# How to snapshot all nodes:
time s._hosts.nodetool('snapshot salvus', wait=True)

# How to initiaite repair all nodes (once a week, takes a long time)
time s._hosts.nodetool('snapshot repair', wait=False)
