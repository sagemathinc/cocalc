
## All this must be in root crontab:

```

*/5 * * * * USER=root /home/salvus/smc/src/scripts/storage/update_BUP 1>/home/salvus/update_storage.log 2>/home/salvus/update_storage.err
0 */12 * * * USER=root /home/salvus/smc/src/scripts/storage/update_SNAPSHOT 1>/home/salvus/update_backups.log 2>/home/salvus/update_backups.err
*/10 * * * * USER=root /home/salvus/smc/src/scripts/storage/update_SNAPSHOT_mounts 2>/home/salvus/update_snapshot_mounts.err
@reboot USER=root /home/salvus/smc/src/scripts/storage/update_SNAPSHOT_mounts 2>/home/salvus/update_snapshot_mounts.err
*/3 * * * * ls /projects/.zfs/snapshot/*/XXX
@reboot ls /projects/.zfs/snapshot/*/XXX

```

## Make sure this in /etc/ssh/sshd_config:

```
# Mount snapshots remotely via sshfs using 'sshfs -o ro,allow_other,default_permissions projects: /mnt/x'
Match User root
     ChrootDirectory /projects/.zfs/snapshot
     ForceCommand internal-sftp
```