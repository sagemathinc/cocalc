For flash stuff, see:

  http://gehrcke.de/2011/06/the-best-and-simplest-tools-to-create-a-basic-websocket-application-with-flash-fallback-and-python-on-the-server-side/

I found this at 

  https://gist.github.com/1185629

I had to make some modifications.

To use the flash fallback you have to run 

  sudo python flash_policy.py 

as root, since it serves on a restricted port.  Just don't bother with
this during testing... but for a real deployment and IE/opera/android
testing, we will have to turn this on.


This works on the following platforms, which is good enough.  
(I can do polling as fallback.)

 OS X:
   * safari
   * chrome
   * firefox
   * opera (after installing flash!)

 Linux:
   * TODO

 Windows 7 64-bit: 
   * chrome
   * firefox
   * opera (after installing flash!)
   * ie9 (only after installing flash!)

 Android 3.2: 
   * chrome (using flash - built in)
   * firefox (DOES NOT WORK) -- sort of fringe

 iPhone:
   * just works (no flash needed)


