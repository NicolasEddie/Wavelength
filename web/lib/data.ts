import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Manifest } from "./lupton";

/** Server-only: read a target's manifest from public/data at build time. */
export function readManifest(slug: string): Manifest {
  const file = join(process.cwd(), "public", "data", slug, "manifest.json");
  return JSON.parse(readFileSync(file, "utf8")) as Manifest;
}
