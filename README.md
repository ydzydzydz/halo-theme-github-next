# Halo Theme GitHub Next

> [!IMPORTANT]
> **本项目是 [原仓库 dengchuanfu/halo-theme-github](https://github.com/dengchuanfu/halo-theme-github) 的 Fork。**
>
> 原作者：[Monster](https://github.com/dengchuanfu)（作者网站 <https://ffbf.top>）基于官方 [`theme-vite-starter`](https://github.com/halo-dev/theme-vite-starter) 开发了原主题。
> 本仓库 `ydzydzydz/halo-theme-github-next` 在原主题基础上继续开发，沿用原项目的 [GPL-3.0](LICENSE) 许可证，原作者署名与版权声明予以保留。
>
> - 原仓库：<https://github.com/dengchuanfu/halo-theme-github>
> - 原仓库 Issues：<https://github.com/dengchuanfu/halo-theme-github/issues>
> - 本仓库（Fork）：<https://github.com/ydzydzydz/halo-theme-github-next>
> - 本仓库 Issues：<https://github.com/ydzydzydz/halo-theme-github-next/issues>

一款仿 GitHub 个人主页风格的 [Halo 2](https://www.halo.run/) 主题。

主题将博客内容组织成类似 GitHub Profile 的界面，支持响应式布局、动态贡献图、站点动态、文章搜索，以及友链、瞬间、图库、留言板等 Halo 内容页面。

## 环境要求

- Halo：`>= 2.20.0`，推荐使用最新稳定版 Halo 2
- 从源码构建时需要 Node.js 20+、Corepack 和 pnpm 10

## 安装主题

### 使用发行包

1. 从仓库的 [Releases](https://github.com/ydzydzydz/halo-theme-github-next/releases) 页面下载最新的 `theme-github-next-版本号.zip`。
2. 登录 Halo Console，进入「外观」->「主题」。
3. 点击「安装主题」并上传下载的 zip 文件。
4. 安装完成后启用 `GitHub Next` 主题。

### 从源码构建

```bash
git clone https://github.com/ydzydzydz/halo-theme-github-next.git
cd halo-theme-github-next
corepack enable
pnpm install
pnpm build
```

构建完成后，主题安装包生成在 `dist/` 目录中，将 zip 文件上传到 Halo Console 即可安装。

## 发版

`pnpm release` 会依次完成：改版本号 → 构建 → 提交 `chore(release): vX.Y.Z` → 推送 `main` 与标签 → 创建 GitHub Release → 等待 CD 工作流上传主题安装包。

```bash
pnpm release                                    # 自增补丁版本号（1.1.7 -> 1.1.8）
pnpm release 1.2.0                              # 指定版本号
pnpm release 1.2.0 --notes-file docs/notes.md   # 自带 Release 说明
pnpm release --dry-run                          # 只打印计划，不做任何改动
```

**不要手动把主题 zip 上传到 Release。** halo-sigs 的 `theme-cd` 工作流会在 Release 发布后自行构建，再用 `gh release upload` 把产物挂上去；手动先传同名文件会让那一步因「asset already exists」失败，结果是 Release 上挂着本地构建的包、CD 却显示失败。脚本因此只创建 Release（不带资产），产物一律由 CD 上传；若 CD 偶发失败，脚本会自动重跑失败作业。

前置条件：当前分支为 `main`、工作区干净、已执行 `gh auth login`。

## 开发

```bash
pnpm install     # 安装依赖（corepack enable 后）
pnpm dev         # 监听源码变化并持续构建
pnpm check       # 格式、lint 与类型检查，可用于 CI 门禁
pnpm check:fix   # 自动修复可修复的问题（会改写工作区文件）
pnpm lint        # 仅运行 lint
pnpm build       # 版本同步 + 清理 + 构建 + 生成主题 zip 包
```

主题源码位于 `src/`，开发构建产物由 Vite 写入 `templates/`。`pnpm build` 会先把 `package.json` 的版本号同步到 `theme.yaml` 的 `spec.version`，也可单独执行 `pnpm version:sync`。

仓库中的 `scripts/dev-theme.sh` 与 `scripts/dev-halo.sh` 用于作者本地工作区联调（后者依赖同级 Halo 源码、JDK 21 与指定 Gradle 环境）。其他开发环境建议按 [Halo 主题开发文档](https://docs.halo.run/developer-guide/theme/prepare) 配置。

### 国际化

文案统一放在 `i18n/`：`default.properties`（简体中文，同时兼作兜底）与 `en.properties`（英文）。Halo 按 `default` → `<语言>` → `<语言>_<地区>` 的顺序合并，后者覆盖同名键；简体中文直接由 `default.properties` 提供，无需再放一份内容相同的 `zh_CN.properties`。

`i18n/*.properties` 是文案的唯一事实来源，`src/partials/messages.html` 与 `src/js/shared/i18n.generated.ts` 由脚本生成，不要手工编辑：

```bash
pnpm gen:messages   # 重新生成
pnpm gen:messages -- --check   # 只校验是否为最新（pnpm check 会自动执行）
```

模板里用 `th:text="#{键名}"`（属性上的文案要走 `th:attr`），脚本里用 `messages.<分组>.<键名>` 读取。

## 截图

本仓库暂未附带预览截图。可按 [Halo 主题开发文档](https://docs.halo.run/developer-guide/theme/prepare) 配置本地环境，运行 `pnpm dev` 后在本地站点逐页自行截取。

## 许可

本项目使用 [GPL-3.0 License](LICENSE)。

本项目为原仓库 [dengchuanfu/halo-theme-github](https://github.com/dengchuanfu/halo-theme-github) 的 Fork，遵循原项目的 GPL-3.0 许可证，保留原作者 Monster 的版权声明与署名。如需使用原主题功能，请优先参考原仓库文档。

## 相关链接

### 原仓库（原作者）

- 原作者：Monster（<https://github.com/dengchuanfu>）
- 作者网站：<https://ffbf.top>
- 原仓库：<https://github.com/dengchuanfu/halo-theme-github>
- 原仓库 Issues：<https://github.com/dengchuanfu/halo-theme-github/issues>

### 本仓库（Fork）

- Fork 仓库：<https://github.com/ydzydzydz/halo-theme-github-next>
- 问题反馈：<https://github.com/ydzydzydz/halo-theme-github-next/issues>

### 相关插件（原作者）

- Personal Assets：<https://github.com/dengchuanfu/personalassets>
