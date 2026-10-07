# 怎么把它变成「点一个链接就能玩」

四种方式，**前两种完全不需要装任何东西**（这台机器上目前也没装 Git）。
玩游戏本身不需要 Node，Node 只在打包单文件 / 起局域网服务器时用。

---

## 方式一：Netlify Drop —— 最快，一分钟拿到公开链接（推荐先试这个）

```bash
npm run build          # 生成 dist/index.html（单文件，634KB，图片都内嵌了）
```

然后：

1. 打开 <https://app.netlify.com/drop>
2. 把 **`dist` 文件夹**拖进网页
3. 立刻得到一个 `https://xxxx.netlify.app` 的公开链接 —— 手机、别人都能点开

> 想长期保留这个站点需要一个免费账号（拖拽后它会提示你认领）。
> Vercel / Cloudflare Pages / 阿里云 OSS 静态托管同理：把 `dist/` 里的东西传上去就行。

---

## 方式二：GitHub Pages —— 没有 Git 也能传（网页上传）

1. 在 GitHub 上新建仓库：**Public**，**不要**勾选任何初始化文件（README/.gitignore 都别加）。
2. 进入空仓库页面，点 **uploading an existing file**（或 Add file → Upload files）。
3. 打开本文件夹，**全选里面的所有文件和文件夹**，拖进浏览器上传框：

   ```
   index.html   css/   js/   assets/   tools/   docs/   README.md   LICENSE   package.json
   ```

   （`.nojekyll`、`.gitignore`、`.github/` 这几个以点开头的，网页上传可能会跳过 ——
   没关系，本项目没有以下划线开头的文件，Pages 不做 Jekyll 处理也不会出问题；
   只是会少掉自动校验的 Action，玩法完全不受影响。）
4. 点 **Commit changes**。
5. 仓库 → **Settings** → 左侧 **Pages** → **Source** 选 `Deploy from a branch`，
   **Branch** 选 `main`、目录选 **`/ (root)`** → **Save**。
6. 等 1 分钟左右，链接就是：

   ```
   https://<你的用户名>.github.io/<仓库名>/
   ```

手机上直接打开就能玩，发给朋友也就是一个链接的事。以后改东西直接在网页上编辑提交，网站会自动更新。

> 如果你愿意装 [Git for Windows](https://git-scm.com/download/win) 或 GitHub Desktop，
> 也可以走命令行（仓库已经准备好，只是这台机器没装 git）：
>
> ```bash
> git init && git add -A && git commit -m "init"
> git remote add origin https://github.com/<你的用户名>/<仓库名>.git
> git branch -M main && git push -u origin main
> ```

---

## 方式三：单文件 HTML —— 双击就能玩，也方便发给别人

```bash
npm run build          # 等价于 node tools/build-single.mjs
```

生成 **`dist/index.html`**（样式 / 脚本 / 立绘**全部内嵌**，不依赖任何外部文件）：

* **双击**它就能玩 —— 不需要起服务器，也不会被浏览器跨域策略挡住；
* 改个名（比如 `大肥鱼吃大白饭.html`）用微信 / QQ 发出去，
  对方存下来用浏览器打开就能玩（手机上同理）；
* 丢进任意静态托管都能直接跑。

---

## 方式四：局域网 —— 手机连同一个 Wi-Fi 试玩

```bash
npm run serve          # 等价于 node tools/serve.mjs
```

会打印：

```
电脑： http://localhost:8080/
手机： http://192.168.1.23:8080/   （同一 Wi-Fi 下打开）
```

---

## 常见问题

**Q：为什么不直接给我一个在线网址？**
我是本地跑的，没有你的 GitHub / 托管账号，没法替你发布。上面任选一种，都只要一两分钟；
**最快的是一分钟内的 Netlify Drop**。

**Q：一定要 Node 吗？**
玩不用。只有 `npm run build`（打包单文件）和 `npm run serve`（局域网服务器）需要 Node 18+。
不想装 Node 的话，直接用仓库根目录的 `index.html` 上传到 GitHub Pages（方式二）也能跑。

**Q：GitHub Pages 上立绘能显示吗？**
能。Pages 走 http(s)，游戏会读 `assets/fish.png` 与 `assets/fish_bowl.png`，
并自动抠背景、裁到角色外框。单文件版则把图片内嵌成 base64，连跨域问题都没有。

**Q：手机上操作顺吗？**
已适配：按住虚拟方向键连续移动、滑动走一格、点相邻格子走一格；
HUD 在窄屏会自动收紧；禁用了双指缩放和下拉刷新。

**Q：想改关卡 / 改数值怎么办？**
见 [`docs/LEVEL_SCHEMA.md`](LEVEL_SCHEMA.md)。改完跑一次：

```bash
npm test        # 12 关校验 + 65 项端到端冒烟（含单文件版）
```
