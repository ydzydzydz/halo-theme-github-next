import { haloThemePlugin } from "@halo-dev/vite-plugin-halo-theme";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [haloThemePlugin()],
  lint: { options: { typeAware: true, typeCheck: true }, ignorePatterns: [".agents"] },
  fmt: {
    printWidth: 100,
    tabWidth: 2,
    useTabs: false,
    endOfLine: "lf",
    sortPackageJson: true,
    insertFinalNewline: true,
    sortImports: {},
    sortTailwindcss: {},
    ignorePatterns: [".agents"],
  },
  staged: {
    // The lint task aborts when the staged set contains no JS/TS file
    // (for example a CSS-only commit), so keep the format check scoped to
    // staged files and only run lint when lintable sources are staged.
    "*": ["vp check --no-lint"],
    "**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}": ["vp lint"],
  },
});
