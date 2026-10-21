import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "reference/**",
    ],
  },
  {
    // The hero animation and viewer draw pre-sized WebP assets with CSS transforms and
    // blend modes; next/image's wrapper and resizing add nothing there.
    files: ["components/HeroMerge.tsx", "components/viewer/Viewer.tsx"],
    rules: { "@next/next/no-img-element": "off" },
  },
];

export default eslintConfig;
