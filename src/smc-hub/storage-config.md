
## All this must be in root crontab:

    # ensure snapshots stay visible (I don't know how to turn off unmounting in ZFS)

    */3 * * * * ls /projects*/.zfs/snapshot/*/XXX

    */5 * * * * USER=root /home/salvus/smc/src/scripts/storage/update_storage 1>/home/salvus/update_storage.log 2>/home/salvus/update_storage.err

    */10 * * * * USER=root /home/salvus/smc/src/scripts/storage/update_snapshot_mounts 2>/home/salvus/update_snapshot_mounts.err
    @reboot USER=root /home/salvus/smc/src/scripts/storage/update_snapshot_mounts 2>/home/salvus/update_snapshot_mounts.err

    0 */12 * * * USER=root /home/salvus/smc/src/scripts/storage/update_backups 1>/home/salvus/update_backups.log 2>/home/salvus/update_backups.err

## Make sure this in /etc/ssh/sshd_config:

    # Mount snapshots remotely via sshfs using 'sshfs -o ro,allow_other,default_permissions projects: /mnt/x'
    Match User root
         ChrootDirectory /projects4/.zfs/snapshot
         ForceCommand internal-sftp
