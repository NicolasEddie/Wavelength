import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Viewer from "@/components/viewer/Viewer";
import { readManifest } from "@/lib/data";
import { TARGETS, targetBySlug } from "@/lib/targets";

export const dynamicParams = false;

export function generateStaticParams() {
  return TARGETS.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = targetBySlug(slug);
  if (!t) return {};
  return { title: `${t.name} (${t.catalogue.split(" · ")[0]})`, description: t.blurb };
}

export default async function TargetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const target = targetBySlug(slug);
  if (!target) notFound();
  const manifest = readManifest(slug);
  const tabs = TARGETS.map((t) => ({ slug: t.slug, short: t.short }));
  return <Viewer manifest={manifest} target={target} tabs={tabs} />;
}
