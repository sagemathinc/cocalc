# How to snapshot all nodes:
time s._hosts.nodetool('snapshot salvus', wait=True)

# How to initiaite repair all nodes (once a week, takes a long time)
time s._hosts.nodetool('snapshot repair', wait=False)

# How to control memory usage for development:

Edit the file

    /home/wstein/salvus/salvus/data/local/cassandra/conf/cassandra-env.sh
    

