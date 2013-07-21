︠c15b3cac-ccb8-4edd-addf-82e9260affc9︠
︡d12eb04a-4e2a-46fb-8bc1-a6cf05b8d5a9︡
︠ebe337e6-c94a-45cf-8dea-e1552a7d8afd︠
s = open('july2013-push.md').read()
tm = 0
sec = 0
for task in s.splitlines():
    if len(task) == 0:
        continue
    if task[:2] == "# ":
       if sec > 0:
            print "%3s"%round(sec)
            sec = 0
       print "%20s:"%task[1:].strip(),
    if '?)' in task and '[x]' not in task:
        i = task.find('(')
        j = task.find(')')
        if i != -1:
            est = task[i+1:j-1]
            k = est.split(':')
            if len(k) == 2:
                h = int(k[0]); m = int(k[1])
                t = h + m/60.0
                tm += t
                sec += t

print "%3s"%round(sec)
print "%20s: %3s"%("Total", round(tm))

print "hi"
︡06e058e2-ca84-4570-ab93-4da74165f340︡{"stdout":"   Top priority bugs:   4\n     Growth features:   4\n   User Visible Bugs:  49\n       User Features:  32\n  Major new features:   9\n         Server Bugs:  12\n     Server Features:   5\n          Operations:"}︡{"stdout":"   7\n"}︡{"stdout":"               Total: 122\n"}︡{"stdout":"hi\n"}︡
︠49578708-54db-404e-98b3-479b1dde27be︠
md(s,hide=0)
︠02960183-cd12-4932-b690-3cf24ec8c593︠









