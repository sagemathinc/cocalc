# The SMC thin provisioned snapshotted compressed volume plugin

This is a flexVolume plugin for k8s, which uses NFS to make thin-provisioned ext4 images, NFS shared directories, and ZFS pools available to pods.

It’s pretty clean – you just declare what NFS server should store the data, and it takes care of the rest.

The main pain was just figuring out precisely what the protocol and expectation were for writing such a plugin, since the docs weren’t crystal clear.

This makes it so we can easily have one container have read-write access to a folder and many other containers that all have read-only access to it.  This also provides n projects with read-write access to single a folder, but it be slower due to NFS latency.

## Why not just use ceph, iscsi, sheepdog, torus or something else?

As far as I can tell, with careful benchmarking, etc., there is simply no point to use any of that tech on GCE.  GCE already provides redundancy for block devices, so doing it again via ceph/sheepdog/etc. is actually kind of pointless.  It turns out just creating a sparse image file and having it sit on a shared filesystem works quite well. The shared filesystem can be provided via NFS as we are doing, or instead via sshfs or anything else, if it comes to that.

With ZFS on the block device, we can even recompact the image – even while live – if the sparse image file gets big/fragmented, and also easily grow the sparse file for increasing container quotas.  Plus we can keep all the snapshots in that one single image file, which is cleane and simple. It is also easy to backup that sparse image file incrementally using bup-split (git) plus some tricks using tar that took me hours to come up with.

## Why compress and deduplicate?

Compression reduces the amount of data that travels over the network, which is a win -- it's done on the client.  Deduplication is local to a single container's image, so the horrible massive memory issues of ZFS dedup that people have aren't a problem for us.

