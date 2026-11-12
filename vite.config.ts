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
    // 消息产物由 scripts/gen-messages.mjs 依据 i18n/*.properties 生成，
    // 格式由生成脚本负责，不参与 prettier 格式化，避免两边反复改写。
    ignorePatterns: [".agents", "src/js/shared/i18n.generated.ts", "src/partials/messages.html"],
  },
  staged: {
    // The lint task aborts when the staged set contains no JS/TS file
    // (for example a CSS-only commit), so keep the format check scoped to
    // staged files and only run lint when lintable sources are staged.
    "*": ["vp check --no-lint"],
    "**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}": ["vp lint"],
  },
});
