#!/usr/bin/env node
/**
 * 一键发版脚本
 *
 * 完整跑通「改版本号 -> 构建 -> 提交 -> 推送 -> 建 Release -> 等 CD 上传产物」：
 *
 *   node scripts/release.mjs                      # 自增补丁版本号（1.1.7 -> 1.1.8）
 *   node scripts/release.mjs 1.2.0                # 指定版本号
 *   node scripts/release.mjs 1.2.0 --notes-file docs/notes.md
 *   node scripts/release.mjs --dry-run            # 只打印计划，不改动任何状态
 *
 * 关键约定：Release 只建壳，**不要手动上传主题 zip**。
 * halo-sigs 的 theme-cd 工作流在 release 发布后会自己构建，
 * 再用 `gh release upload` 把产物挂到 Release 上；
 * 手动先传同名文件会让那一步因「asset already exists」失败，
 * 结果就是 Release 上挂着本地构建的包、CD 却显示失败。
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const themeDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = join(themeDir, "package.json");

// ---------- 命令执行 ----------

/** 执行命令并返回标准输出；失败时直接抛错退出。 */
const capture = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: themeDir,
    encoding: "utf8",
    ...options,
  });

  if (result.error) {
    throw new Error(`${command} 执行失败：${result.error.message}`);
  }

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(
      `${command} ${args.join(" ")} 退出码 ${result.status}${detail ? `：\n${detail}` : ""}`,
    );
  }

  return (result.stdout || "").trim();
};

/** 执行命令，输出直接透传到终端。 */
const run = (command, args) => {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd: themeDir, stdio: "inherit" });

  if (result.error) {
    throw new Error(`${command} 执行失败：${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} 退出码 ${result.status}`);
  }
};

// ---------- 参数解析 ----------

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const notesFileIndex = argv.indexOf("--notes-file");
const notesFile = notesFileIndex >= 0 ? argv[notesFileIndex + 1] : undefined;
const versionArg = argv.find((arg) => /^v?\d+\.\d+\.\d+$/.test(arg));

if (notesFileIndex >= 0 && !notesFile) {
  console.error("--notes-file 后面需要跟一个文件路径");
  process.exit(1);
}

if (notesFile && !existsSync(join(themeDir, notesFile))) {
  console.error(`Release 说明文件不存在：${notesFile}`);
  process.exit(1);
}

// ---------- 版本号 ----------

const currentVersion = JSON.parse(readFileSync(packageJsonPath, "utf8")).version;

/** 不传版本号时按补丁位自增，与仓库一贯的补丁号发版节奏一致。 */
const nextVersion = versionArg
  ? versionArg.replace(/^v/, "")
  : (() => {
      const [major, minor, patch] = currentVersion.split(".").map(Number);
      return `${major}.${minor}.${patch + 1}`;
    })();

const tag = `v${nextVersion}`;

if (nextVersion === currentVersion) {
  console.error(`版本号与当前一致（${currentVersion}），请指定更高的版本号`);
  process.exit(1);
}

// ---------- 前置检查 ----------

const ensure = (condition, message) => {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
};

const currentBranch = capture("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
const status = capture("git", ["status", "--porcelain"]);

ensure(currentBranch === "main", `当前分支是 ${currentBranch}，发版请切到 main 分支`);
ensure(status === "", "工作区还有未提交的改动，请先提交或暂存后再发版");

try {
  capture("gh", ["auth", "status"]);
} catch {
  console.error("gh 未登录，无法创建 Release，请先执行 `gh auth login`");
  process.exit(1);
}

const remoteUrl = capture("git", ["remote", "get-url", "origin"]);
const existingTag = capture("git", ["tag", "--list", tag]);
ensure(existingTag === "", `标签 ${tag} 已存在，请换一个版本号`);

console.log(`\n发版计划：${currentVersion} -> ${nextVersion}`);
console.log(`  提交信息：chore(release): ${tag}`);
console.log(`  Release：${tag}（只建壳，产物由 CD 工作流上传）`);
console.log(`  说明来源：${notesFile ?? "自动生成（取自上一个版本之后的提交）"}`);

if (dryRun) {
  console.log("\n--dry-run：未做任何改动。");
  process.exit(0);
}

// ---------- 1. 改版本号 ----------

run("pnpm", ["version", nextVersion, "--no-git-tag-version"]);
run("node", ["scripts/sync-version.mjs"]);

// ---------- 2. 构建（本地 zip 仅用于自检，不上传） ----------

run("pnpm", ["build"]);

const packageFile = join(themeDir, "dist", `theme-github-next-${nextVersion}.zip`);
ensure(existsSync(packageFile), `构建完成但没有产出 ${packageFile}`);

// ---------- 3. 提交并推送 ----------

run("git", ["add", "package.json", "theme.yaml"]);
run("git", ["commit", "-m", `chore(release): ${tag}`]);
run("git", ["push", "origin", "main"]);
run("git", ["tag", tag]);
run("git", ["push", "origin", tag]);

// ---------- 4. 建 Release（不附加资产） ----------

const releaseArgs = ["release", "create", tag, "--title", tag];
if (notesFile) {
  releaseArgs.push("--notes-file", notesFile);
} else {
  releaseArgs.push("--generate-notes");
}
run("gh", releaseArgs);

const assets = JSON.parse(
  capture("gh", ["release", "view", tag, "--json", "assets", "--jq", ".assets[].name"]),
);
ensure(
  assets === "",
  `Release ${tag} 上已有资产（${assets}），CD 上传会因同名冲突失败，请先删除这些资产`,
);

// ---------- 5. 等 CD 工作流上传产物 ----------

/** 找到这次发布对应的 CD 运行。 */
const findRun = () => {
  const runs = JSON.parse(
    capture("gh", [
      "run",
      "list",
      "--workflow",
      "CD",
      "--limit",
      "10",
      "--json",
      "databaseId,headBranch,status,conclusion",
    ]),
  );
  return runs.find((item) => item.headBranch === tag);
};

let runInfo = null;
for (let attempt = 0; attempt < 20; attempt += 1) {
  runInfo = findRun();
  if (runInfo) break;
  execFileSync("sleep", ["3"]);
}

ensure(runInfo, `没有找到 ${tag} 对应的 CD 运行，请到 Actions 页面确认`);

// theme-cd 工作流里上传用 upload-artifact@v7、下载用 download-artifact@v8，
// 摘要校验在同一轮运行中偶发失败（v1.1.6 的首发也这样失败过一次）。
// 失败时重跑失败作业即可，成功的那次会正常把产物挂到 Release 上。
for (let attempt = 0; attempt < 3; attempt += 1) {
  console.log(`\nCD 运行 #${runInfo.databaseId}（${runInfo.status} / ${runInfo.conclusion}）`);

  const watch = spawnSync("gh", ["run", "watch", String(runInfo.databaseId), "--exit-status"], {
    cwd: themeDir,
    stdio: "inherit",
  });

  if (watch.status === 0) {
    break;
  }

  if (attempt === 2) {
    console.error("CD 连续三次失败，请到 Actions 页面查看日志");
    process.exit(1);
  }

  console.log("\nCD 失败，重跑失败作业后重试…");
  run("gh", ["run", "rerun", String(runInfo.databaseId), "--failed"]);
  execFileSync("sleep", ["10"]);
  runInfo = findRun() ?? runInfo;
}

// ---------- 6. 校验产物 ----------

const finalAssets = JSON.parse(
  capture("gh", ["release", "view", tag, "--json", "assets", "--jq", ".assets[].name"]),
);
ensure(
  finalAssets.includes(`theme-github-next-${nextVersion}.zip`),
  `Release ${tag} 上没有找到主题安装包，请检查 CD 日志`,
);

console.log(`\n发版完成：${tag}`);
console.log(
  `  Release：${remoteUrl.replace("git@github.com:", "https://github.com/")}/releases/tag/${tag}`,
);
console.log(`  产物：${finalAssets.join(", ")}`);
