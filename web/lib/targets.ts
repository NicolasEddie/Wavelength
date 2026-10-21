/** Editorial copy for each target. Measurements come from the exported manifests. */
export interface TargetInfo {
  slug: string;
  name: string;
  short: string;
  catalogue: string;
  kind: string;
  constellation: string;
  distance: string;
  blurb: string;
}

export const TARGETS: TargetInfo[] = [
  {
    slug: "m51",
    name: "The Whirlpool Galaxy",
    short: "Whirlpool",
    catalogue: "M51 · NGC 5194",
    kind: "Face-on spiral",
    constellation: "Canes Venatici",
    distance: "about 30 million light-years",
    blurb:
      "A spiral seen face-on, pulling at its smaller companion NGC 5195. The interaction stirs up the bright, clumpy star-forming knots along its arms.",
  },
  {
    slug: "m101",
    name: "The Pinwheel Galaxy",
    short: "Pinwheel",
    catalogue: "M101 · NGC 5457",
    kind: "Face-on spiral",
    constellation: "Ursa Major",
    distance: "about 21 million light-years",
    blurb:
      "A large, lopsided spiral with low surface brightness. Its faint outer arms need a gentler stretch than the other targets to show up at all.",
  },
  {
    slug: "m104",
    name: "The Sombrero Galaxy",
    short: "Sombrero",
    catalogue: "M104 · NGC 4594",
    kind: "Edge-on spiral",
    constellation: "Virgo",
    distance: "about 30 million light-years",
    blurb:
      "A spiral seen almost edge-on, with a bright central bulge cut through by a dark lane of dust. A test of how the stretch handles a very bright core.",
  },
  {
    slug: "m13",
    name: "The Hercules Cluster",
    short: "Hercules Cluster",
    catalogue: "M13 · NGC 6205",
    kind: "Globular cluster",
    constellation: "Hercules",
    distance: "about 22,000 light-years",
    blurb:
      "A ball of several hundred thousand old stars in our own galaxy's halo. Its crowded core is the hardest field here for source detection to pull apart.",
  },
];

export const targetBySlug = (slug: string) => TARGETS.find((t) => t.slug === slug);
