/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { StaticImageData } from "next/image";

import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import { COLORS } from "@cocalc/util/theme";
import kiran from "public/features/kiran.jpeg";
import conley from "public/features/will_conley.jpg";
import { Paragraph } from "./misc";
import A from "./misc/A";
import Image from "./landing/image";

export interface Testimonial {
  name: string;
  image?: StaticImageData;
  website?: string; // a URL
  affiliation?: string | { url: string; name: string };
  date: string;
  content: string; // markdown
}
export const TESTIMONIALS: Readonly<Testimonial[]> = [
  {
    name: "Undergraduate Student",
    date: "March 2024",
    content: `CoCalc is likely the best online environment for project-based work, even for undergraduate students like myself. In our class, we have to train large machine learning models on Python notebooks, so we wanted to look for an easy-to-use online solution where we could collaborate and access powerful resources for training. Not only was the setup and documentation easy to follow, the environment and tools that CoCalc provides are top-notch. You can tell that CoCalc was built with care and passion.

A few days in, our group faced a problem (completely our own fault, I may add). We contacted support, initially expecting the usual long, drawn-out exchange with support staff to debug our issue. We never expected that the CEO and founder of CoCalc himself would give a practically instantaneous reply with his insights on our issue. In fact, he nailed our issue on the first try, and we have not had a problem since.

CoCalc has been an incredible resource and force multiplier for my undergraduate studies with its ease of use and powerful capabilities. There were some issues due to our relative inexperience with remote platforms and Linux servers, but I believe the amazing support provided by CoCalc wholly negates any concerns we have from now on. I would wholeheartedly recommend this to any student considering CoCalc as an extension of their local environment for studying and practicing machine learning.`,
  },
  {
    name: "John Spitzer",
    date: "March 2024",
    content: `
I have used SageMath for a long time.
The mathematics community does make an effort to provide open source options unlike the physics community which is only now discovering the attractions of open source.

I have been using CoCalc for some time now and I have noticed a significant improvement in performance over recent times while the pricing is excellent.

My recent work has been done entirely on CoCalc and it all worked fine.
It is a great development environment.
All the best and keep up the good work!`,
  },
  {
    name: "Travis",
    date: "Winter 2024",
    content: `
I turned to CoCalc for a few major reasons:
1. some familiarity with the platform already
2. instructor/course features
3. responsive support if needed
4. transparent pricing
5. trusted data privacy and handling (avoiding some other platforms for questionable practices)

Setting up the course was straightforward with the website guides, and the message I sent for some advice was promptly replied. Setting up the course was intuitive, from adding students to distributing the handouts. I did not use any grading features for this, as it was a workshop just for learning.

The purchase of computation resources was transparent, intuitive, and easy to navigate. Furthermore, I was pleased with the price and because of the affordability, I was able to keep the project upgraded throughout the entire 3 weeks so that participants could practice in between sessions instead of only during the workshop. This was well received by everyone involved and helped promote self learning.
`,
  },
  {
    // https://sagemathcloud.zendesk.com/agent/tickets/13633
    name: "Hugh Thomas",
    date: "October 2023",
    affiliation:
      "LaCIM, Département de Mathématiques, Université du Québec à Montréal",
    content: `
I do different things with CoCalc.
Right now, I am editing a shared LaTeX document which is a math paper.

I also use it for simple calculations with rational functions, which I would screw up if I did them by hand.
Recently I used it as a convenient interface to Macauay2, which it is great for since I can never figure out how Macaulay2's interface is supposed to work.

All that to say, I feel like I am using only a tiny fraction of the power of CoCalc, but it is making my life easier, and I am grateful for it.`,
  },

  {
    // https://sagemathcloud.zendesk.com/agent/tickets/13664
    name: "Chuck Livingston",
    date: "September 2023",
    website: "https://math.indiana.edu/about/emeriti/livingston-charles.html",
    affiliation: {
      url: "https://math.indiana.edu/",
      name: "Department of Mathematics, Indiana University",
    },
    content: `
CoCalc has provided me with a stable, fully equipped, environment in which I've been able to build my programming skills and develop some worthwhile programs for my mathematics community – all for the cost of a cup of coffee each month.  It's been a tremendously valuable resource for me.`,
  },

  // https://sagemathcloud.zendesk.com/agent/tickets/13676
  {
    name: "Scott Smith",
    website:
      "https://www.wlu.ca/academics/faculties/faculty-of-science/faculty-profiles/scott-smith/index.html",
    affiliation: {
      name: "Dept. of Chemistry and Biochemistry, Wilfrid Laurier University",
      url: "https://www.wlu.ca/",
    },
    date: "May 2023",
    content: `
Amazing!  Now a chemistry nerd like me can do some pretty fancy things
without having to also become a computer scientist.
And share those things with those even less computer-programmy than myself.
So that chemistry advances without “getting lost in the weeds”.

Time travel !!! wow !! I love that.  (I could have used that many many times.  Haha).

I was pretty sad when mybinder stopped working. [...] I know that CoCalc will be a new and improved replacement for mybinder.  And does not seem like a steep learning curve at all.

The documentation (and support!) is fabulous !!`,
  },

  {
    name: "Kiran Kedlaya",
    image: kiran,
    date: "March 2017",
    website: "https://kskedlaya.org/",
    affiliation: {
      url: "https://math.ucsd.edu/",
      name: "Department of Mathematics, University of California, San Diego",
    },
    content: `
I just found out that my CoCalc class got by far the best course evaluations for any course I've taught at UCSD to date (over 85% on the favorable/unfavorable scale), which makes it a sure thing that I'll be teaching this course again (in some form) next year! Many thanks for the backend work on CoCalc, for the course materials, for the guest lecture...`,
  },
  {
    name: "Will Conley",
    image: conley,
    date: "Fall 2016",
    website: "https://www.math.ucla.edu/~conley/",
    affiliation: {
      url: "https://www.math.ucla.edu/",
      name: "Department of Mathematics, University of California, Los Angeles",
    },
    content: `
CoCalc provides a user-friendly interface.
Students don't need to install any software at all.
They just open up a web browser and go to cocalc.com and that's it.

They just type code directly in, hit shift+enter and it runs, and they can see if it works.
It provides immediate feedback.
The course management features work really well.`,
  },
] as const;

export function twoRandomTestimonials(): [Testimonial, Testimonial] {
  let t1 = TESTIMONIALS[Math.floor(Math.random() * TESTIMONIALS.length)];
  let t2 = t1;
  while (t2 === t1) {
    t2 = TESTIMONIALS[Math.floor(Math.random() * TESTIMONIALS.length)];
  }
  return [t1, t2];
}

const STYLE: React.CSSProperties = {
  borderLeft: `3px solid ${COLORS.GRAY_L}`,
  paddingLeft: "1em",
  color: COLORS.GRAY_DD,
  fontStyle: "italic",
};

const STYLE_BELOW: React.CSSProperties = {
  textAlign: "right",
  fontSize: "80%",
  fontStyle: "italic",
};

export function TestimonialComponent({
  testimonial,
}: {
  testimonial: Testimonial;
}) {
  const { name, website, affiliation, content, date, image } = testimonial;

  function renderName() {
    if (website) {
      return <A href={website}>{name}</A>;
    } else {
      return name;
    }
  }

  function renderAffiliation() {
    if (!affiliation) return;
    if (typeof affiliation === "string") {
      return <>({affiliation})</>;
    } else {
      return <>({<A href={affiliation.url}>{affiliation.name}</A>})</>;
    }
  }

  function renderDate() {
    return `${date}`;
  }

  function renderImage() {
    if (!image) return;
    return (
      <Image
        src={image}
        alt={name}
        style={{
          width: "90px",
          borderRadius: "6px",
          float: "left",
          margin: "0 15px 15px 0",
        }}
      />
    );
  }

  return (
    <Paragraph style={STYLE}>
      {renderImage()}
      <Markdown value={content} />
      <div style={STYLE_BELOW}>
        – {renderName()}, {renderDate()}
      </div>
      <div style={STYLE_BELOW}>{renderAffiliation()}</div>
    </Paragraph>
  );
}
