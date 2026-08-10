# blog — wym

个人博客,关于数学、代码与有趣想法的笔记本。

## 站点

- 地址: <https://wym100171113.github.io/>
- 纯静态 HTML/CSS/JS,无构建步骤,由 GitHub Actions 自动部署到 GitHub Pages
- 文章用 Markdown 写作(Obsidian 工作流),内容在 `posts/` 目录

## 写作与发布

详见 [`发布指南.md`](./发布指南.md):在 `posts/` 下新建文章,推送到 `main` 分支,约 1 分钟后自动上线。

```bash
git clone https://github.com/wym100171113/wym100171113.github.io
# 新增/编辑 posts/*.md 后
git add -A && git commit -m "feat: 新文章"
git push
```

## 目录结构

```
posts/          文章(Markdown + frontmatter)
tools/blog.py   构建工具(生成 index.json 等)
assets/         样式与脚本
.github/workflows/  Pages 自动部署
```
