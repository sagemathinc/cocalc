/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
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
