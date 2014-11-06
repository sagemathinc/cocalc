︠2fb58d82-2770-41e6-90d1-73469686ab2casi︠
%auto
%hide
print "click for code"
def task_estimate(tag='today', file='smc.tasks'):
    tm = 0
    OPENING = '"desc":"('
    for x in os.popen('%s | grep -v done\\":1'%('grep %s %s '%(tag, file) if tag else 'cat %s'%file)).readlines():
        i = x.find(OPENING)
        if i == -1:
            continue
        i += len(OPENING)
        j = x.find('?)')
        s = x[i:j]
        print x[:100]
        k = s.split(":")
        h = int(k[0])
        if len(k)>1:
            try:
                m = int(k[1])
            except:
                print x
                raise
        else:
            m = 0
        tm += 60*h + m

    print "-"*70
    print "Total: (%s:%s)"%(tm//60,tm%60)

    for k in [4,8,9,12,16]:
        print "- %5.1f days at %2s hours/day"%(tm/60./k, k)

︡e724ab1b-c8c9-4e1a-9623-86f80675ff25︡{"auto":true}︡{"stdout":"click for code\n"}︡
︠853e9733-f142-410d-bcdc-395dc94e5e3a︠
task_estimate()
︡b257d883-0b5f-43dd-95be-3a770d349269︡{"stdout":"{\"desc\":\"(0:30?) #ui #tasks #today\\nshow due dates in past in done tasks NOT in red.\\n\\n> When Done \n{\"desc\":\"(0:30?) #today #urgent #bug #analytics\\nProblem with google analytics event tracking code.\\\n{\"desc\":\"(1:30?) (0:17) #today #urgent #bug #ipython\\nupgrade ipython to fix bugs, including latex f\n{\"desc\":\"(0:20?) #today #ui\\nmove project search to left for consistency with other searches (file, \n{\"desc\":\"(0:30?) #today #bug\\nin the file browser, the \\\"Showing only files that contain \\\" is often\n{\"desc\":\"(0:45?) #today\\nfix the \\\"undefined undefined\\\" in invitation email.\\n\\nhttps://mail.google\n{\"desc\":\"(3:00?) #sagews #feature #today\\nability to graphically edit html (?) text to annotate\\n\\nT\n{\"desc\":\"(0:20?) #today\\n`<br>` in project title\\n\\nhttps://mail.google.com/mail/u/0/#inbox/1497ad43\n{\"desc\":\"(0:20?) #today #urgent\\nThis code in misc_page.coffee is totally wrong -- what is element?\\\n----------------------------------------------------------------------\nTotal: (7:45)\n-   1.9 days at  4 hours/day\n-   1.0 days at  8 hours/day\n-   0.9 days at  9 hours/day\n-   0.6 days at 12 hours/day\n-   0.5 days at 16 hours/day\n"}︡
︠4061ad2d-2122-42cf-89db-fe6122a59a67︠









