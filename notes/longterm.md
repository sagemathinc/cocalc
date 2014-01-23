# Longterm Planning

## 2014-01-20

### Usage status

Right now, as I write this:

 - There are 193 clients connected right now who are actively modifying 42 projects. They modified 623 projects in the last day, 2826 projects in the last week, and 23841 projects in the last month.
 - There are 17298 accounts and 25651 projects.
 - Account creations: 176 users/day
 - Last week: 5195 unique visitors
 - Last week: 2141 returning unique
 - Over 250 connections at once sometimes.

So... from this we could conclude that SMC has "just over 2000 active users".

Upper bound: If there were a way to make a $10/user/month profit that would be $20K/month.
Realistic bound: $5/month profit on 1% of active users, which means $100/month.

### Business model status

There were a lot of discussions about plans, but I'm not happy with them.
I don't think it is possible to correctly come up with "plans" until
I know exactly how I'm going to restrict projects, and that
won't be clear until I have implemented the following:

  - restrict RAM usage per project
  - restrict CPU usage per project
  - a global disk usage quota across all owned projects.
  - public projects: what does this mean?
  - class  projects: what does this mean?

Other issues before charging:

  - Can't charge for a full "plan" given the number of bugs and UI issues.
  - Could charge for something though.

What are the minimal simplest possible things we could charge for, with little work, to start things?

  - Remove project timeouts: but this matters only to researchers; causes pain but little benefit
  - Increase default project quota from 5GB to 10GB: who cares?  5GB is already *HUGE*, except for researchers.
  - Have two cgroup priority groups: pretty abstract.

  - Private vs public: everybody cares -- concrete.

  - Course projects: ability to create and join -- this is *concrete* functionality:  $15/student/course

My goal for SMC is to get HUGE -- I want *millions of users*, and a major company out of this.  I don't want a lifestyle business.   Trying to monetize too early could make that not happen and conflicts with my strategy of amassing resources this year.  I also have enough resources that there is no need to restrict usage right now.  Given then hardware and resources I have, and tech available (ZFS, cgroups, etc.), and load under usage "There are 189 clients connected right now who are actively modifying 32 projects" = "about 1% usage"... there's no reason whatever to have any traditional plans based on restricting resource usage... yet.

Another possible way to have plans right off would be purely via a support mechanism.  E.g., pay $10/month and you get your name added to a special high priority private mailing list.  There are no SLA guarantees; however, any support requests to this list get highest priority.  Simple as that.

 * Standard Account:
   - Price: free

 * Premium Account:
   - Priority technical support and consideration when developing features (however, no guarantees); access to special mailing list.
   - Priority for disk quota increases, special requests (e.g. remove timeouts from your projects on a case-by-case basis), etc.
   - Kudos for helping supporting the project at a critical time.
   - $100 for 6 months

Hi Keith and Harald,

I've been thinking about (1) the discussions in Hawaii, (2) talking with people at the JMM, and (3) talking with people at the commercialization center.   I also want to get started with something that could generate revenue for SMC beyond the idea of selling a license for somebody to run their own copy, which seems premature until the codebase is really stable.

Regarding (1) -- the discussions in Hawaii -- David Roe was pushing hard the idea of a bunch of different plans with various technical distinctions.   This is pretty much what every "coding on the web" site does that sells anything, and my impression is none of them are successful yet.   In talking to people at the JMM, I'm concerned this won't work, at least not given the goal of being big.  It might work if the ultimate goal were a $4K/month "lifestyle business", but that is definitely _not_ the goal.   There are several factors:

   - I think it's absolutely critical that we gain a huge number of active users, due to the "network effect" (value ~ (number of users)^2).   Right now our number of "weekly return unique visitors" is just over 2000.   Charging for a bunch of different plans could hurt.

   - I have amassed a lot of hardware and also the GCE support.  Right now with "There are 208 clients connected right now who are actively modifying 48 projects." when I look at "top" on the compute machines there is about 1% load overall.  I.e., I think SMC as it is right now can handle much more usage.  The occasional local spikes due to out-of-control users will be eliminated soon via cgroups.  And with GCE we will have to spend about 7K on average for the rest of the year just to use it up by when it expires, and we are nowhere near using that much GCE usage right now (I will increase usage soon).   So there is no *need* to charge during 2014 in order to provide the hardware resources needed to support way more users than we have now.   The only cost is $600/month for a rack rental, which I can cover via grant funds.

The C4C office at UW has trouble with numerous small transactions, so they really don't like the idea of monthly fees, or many small fees for specific things.   Here's a very simple proposal.  There are two types of accounts:

 1. Standard Account:
   - Price: free
   - exactly like what is available now

 2. Premium Account:
   - Price: $100 for 6 months
   - Priority technical support and consideration when developing features (however, no guarantees); access to special mailing list.
   - Priority for disk quota increases, special requests (e.g. remove timeouts from your projects on a case-by-case basis), etc.
   - It will say "Premium account" in the settings page, and have a support link (and maybe a picture of me as attached, since a picture of a support person is common on support websites).

It's a simple distinction, and will give us a good sense of how many seriously interested people there are right now, and what they want and are willing to pay for.  Basically it is the idea to "do things that don't scale" [1] instead of imposing an arbitrary but easy to scale pricing model (e.g., like everybody else does).   Also, feature requests from paying customers would be particularly valuable in deciding what to work on at this point in time, now that the overall architecture is settled.   I'm imagining that we would pretty quickly get about 20-50 faculty customers, who would mostly likely charge this to some grant in their department.  Then perhaps a handful of new signups per week.

It's hard to imagine how this could go wrong, given that having a premium account doesn't actually promise any *specific* functionality at all.

To make this work technically, I should implement a "support message composer" inside of SMC itself.  This would have the advantage that it would provide more relevant state information (e.g., project_id, exact time, affected file, browser version, relevant connection info) than users can possibly provide themselves in email.   We would address the messages from premium customers first.   Currently, I think I'm pretty responsive to SMC user emails (I get numerous ones offlist), and I find that it takes relatively little time to handle all of them.

For C4C to be on board, I need to get them to finalize their much longer "terms of usage".  Also, I'll have to integrate SMC with their billing system.

Thoughts?

 -- William

[1] http://paulgraham.com/ds.html





