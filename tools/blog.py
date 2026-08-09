#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
blog · wym 博客内容管理工具 (CMS CLI)
================================================
用法:
    python3 tools/blog.py new "文章标题" [--tags 数学,算法] [--slug custom]
    python3 tools/blog.py serve [--port 8000]
    python3 tools/blog.py check
    python3 tools/blog.py build
    python3 tools/blog.py publish "提交说明" [--push]

只依赖 Python 标准库，无第三方包。
"""

import argparse
import datetime
import html
import json
import re
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POSTS = ROOT / "posts"
ASSETS = ROOT / "assets"

# 站点信息 —— 发布地址与作者名，改这里即可
SITE_URL = "https://wym100171113.github.io"
SITE_NAME = "blog · wym"
SITE_TAGLINE = "把复杂的，讲得漂亮。"
AUTHOR = "wym"

FRONTMATTER_RE = re.compile(r"^---\r?\n(.*?)\r?\n---\r?\n?(.*)$", re.S)


# ---------------------------------------------------------------------------
# Frontmatter 解析
# ---------------------------------------------------------------------------

def parse_frontmatter(text: str):
    """解析 markdown 顶部的 --- 块，返回 (meta, body)。"""
    m = FRONTMATTER_RE.match(text)
    if not m:
        return {}, text
    meta = {}
    for line in m.group(1).splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        if key == "tags":
            try:
                meta[key] = json.loads(value)
            except Exception:
                meta[key] = [t.strip() for t in value.strip("[]").split(",") if t.strip()]
        elif value.lower() in ("true", "false"):
            meta[key] = value.lower() == "true"
        else:
            meta[key] = value.strip('"\'')
    return meta, m.group(2)


def read_posts():
    """读取 posts/ 下所有 .md，返回 [{meta, body, slug}]，按日期倒序。"""
    items = []
    for f in sorted(POSTS.glob("*.md")):
        slug = f.stem
        try:
            text = f.read_text(encoding="utf-8")
        except OSError as e:
            print(f"  ! 无法读取 {f.name}: {e}", file=sys.stderr)
            continue
        meta, body = parse_frontmatter(text)
        items.append({"slug": slug, "meta": meta, "body": body, "path": f})
    items.sort(key=lambda x: x["meta"].get("date", "0000-00-00"), reverse=True)
    return items


def is_published(item) -> bool:
    meta = item["meta"]
    if meta.get("status") == "draft":
        return False
    return bool(meta.get("date")) and meta.get("title")


def reading_minutes(body: str) -> int:
    """按中文字符 + 英文单词估算阅读时长（约 400 字/分钟）。"""
    cjk = len(re.findall(r"[\u4e00-\u9fff]", body))
    words = len(re.findall(r"[A-Za-z0-9]+", body))
    return max(1, round((cjk + words) / 400))


# ---------------------------------------------------------------------------
# 命令：new —— 新建文章
# ---------------------------------------------------------------------------

def slugify(title: str) -> str:
    s = re.sub(r"[^\w\u4e00-\u9fff-]+", "-", title.strip().lower()).strip("-")
    return s if re.fullmatch(r"[a-z0-9-]+", s) else f"post-{datetime.date.today():%Y%m%d}"


TEMPLATE = """---
title: {title}
date: {date}
tags: [{tags}]
excerpt: 在这里写一两句话作为摘要，会显示在首页文章列表里。
---

正文从这里开始。

## 小节标题

支持完整的 Markdown 语法：**粗体**、*斜体*、`行内代码`、[链接](https://example.com)、列表、引用、表格、图片。

```python
print("hello, wym")
```

数学公式（KaTeX 渲染）：行内 $E = mc^2$，独立 $$E = mc^2$$

写完后运行 `python3 tools/blog.py build && python3 tools/blog.py publish "新文章" --push` 即可发布。
"""


def cmd_new(args):
    title = args.title.strip()
    if not title:
        print("错误：需要文章标题", file=sys.stderr)
        sys.exit(1)
    slug = args.slug or slugify(title)
    if not slug:
        print("错误：无法生成文件名，请用 --slug 指定", file=sys.stderr)
        sys.exit(1)
    tags = [t.strip() for t in args.tags.split(",") if t.strip()] or ["随笔"]
    path = POSTS / f"{slug}.md"
    if path.exists():
        print(f"错误：{path.relative_to(ROOT)} 已存在", file=sys.stderr)
        sys.exit(1)
    date = datetime.date.today().isoformat()
    path.write_text(
        TEMPLATE.format(title=title, date=date, tags=", ".join(tags)),
        encoding="utf-8",
    )
    print(f"已创建 {path.relative_to(ROOT)}")
    print("打开它写正文吧。写完后：")
    print("  python3 tools/blog.py build")
    print("  python3 tools/blog.py publish \"新文章\" --push")


# ---------------------------------------------------------------------------
# 命令：serve —— 本地预览
# ---------------------------------------------------------------------------

def cmd_serve(args):
    import functools
    import http.server

    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    print(f"本地预览：http://127.0.0.1:{args.port}/   （Ctrl+C 停止）")
    http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler).serve_forever()


# ---------------------------------------------------------------------------
# 命令：check —— 校验文章
# ---------------------------------------------------------------------------

def cmd_check(args):
    items = read_posts()
    errors = 0
    for it in items:
        meta, body, slug = it["meta"], it["body"], it["slug"]
        problems = []
        if not meta.get("title"):
            problems.append("缺少 title")
        if not meta.get("date"):
            problems.append("缺少 date")
        elif not re.fullmatch(r"\d{4}-\d{2}-\d{2}", meta["date"]):
            problems.append(f"date 格式应为 YYYY-MM-DD，当前为 {meta['date']!r}")
        if meta.get("status") not in (None, "draft", "published"):
            problems.append(f"status 非法：{meta['status']!r}")
        if not body.strip():
            problems.append("正文为空")
        if problems:
            errors += 1
            print(f"  ! {slug}.md：{'；'.join(problems)}")
    published = [it for it in items if is_published(it)]
    print(f"共 {len(items)} 篇（其中待发布 {len(published)} 篇，草稿 {len(items) - len(published)} 篇）")
    if errors:
        print(f"发现 {errors} 处问题，请修复后重新运行 check")
        sys.exit(1)
    print("全部通过 ✔")


# ---------------------------------------------------------------------------
# 命令：build —— 重建索引 / RSS / 站点地图（幂等，可重复运行）
# ---------------------------------------------------------------------------

def build_manifest():
    items = read_posts()
    manifest = []
    for it in items:
        if not is_published(it):
            continue
        meta, body = it["meta"], it["body"]
        tags = meta.get("tags") or []
        manifest.append({
            "slug": it["slug"],
            "title": meta["title"],
            "date": meta["date"],
            "tags": tags,
            "excerpt": meta.get("excerpt", ""),
            "category": tags[0] if tags else "随笔",
            "readTime": f"{reading_minutes(body)} 分钟",
        })
    (POSTS / "index.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return manifest


def build_feed(manifest):
    def esc(s):
        return html.escape(str(s), quote=False)

    def rfc822(iso):
        d = datetime.datetime.strptime(iso, "%Y-%m-%d")
        weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        return (f"{weekdays[d.weekday()]}, {d.day:02d} {months[d.month - 1]} "
                f"{d.year} 00:00:00 +0800")

    items = "\n".join(
        f"""    <item>
      <title>{esc(p['title'])}</title>
      <link>{SITE_URL}/post.html?slug={urllib.parse.quote(p['slug'])}</link>
      <guid>{SITE_URL}/post.html?slug={urllib.parse.quote(p['slug'])}</guid>
      <pubDate>{rfc822(p['date'])}</pubDate>
      <description>{esc(p['excerpt'] or p['title'])}</description>
      <category>{esc(p['category'])}</category>
    </item>"""
        for p in manifest
    )
    feed = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>{esc(SITE_NAME)}</title>
    <link>{SITE_URL}/</link>
    <description>{esc(SITE_TAGLINE)}</description>
    <language>zh-CN</language>
    <atom:link href="{SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
{items}
  </channel>
</rss>
"""
    (ROOT / "feed.xml").write_text(feed, encoding="utf-8")


def build_sitemap(manifest):
    urls = ["/", "/archive.html", "/about.html"]
    urls += [f"/post.html?slug={urllib.parse.quote(p['slug'])}" for p in manifest]
    entries = "\n".join(
        f"  <url><loc>{SITE_URL}{u}</loc></url>" for u in urls
    )
    sitemap = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{entries}
</urlset>
"""
    (ROOT / "sitemap.xml").write_text(sitemap, encoding="utf-8")


def cmd_build(args):
    manifest = build_manifest()
    build_feed(manifest)
    build_sitemap(manifest)
    print(f"已重建 posts/index.json、feed.xml、sitemap.xml（{len(manifest)} 篇文章）")


# ---------------------------------------------------------------------------
# 命令：publish —— 提交并推送
# ---------------------------------------------------------------------------

def cmd_publish(args):
    import subprocess

    def run(*cmd):
        r = subprocess.run(cmd, cwd=ROOT)
        return r.returncode

    run("git", "add", "-A")
    if run("git", "diff", "--cached", "--quiet") == 0:
        print("没有改动，无需提交")
    else:
        msg = args.message or "chore: 更新博客"
        if run("git", "commit", "-m", msg) != 0:
            print("提交失败", file=sys.stderr)
            sys.exit(1)
        print(f"已提交：{msg}")
    if args.push:
        if run("git", "push") != 0:
            print("推送失败", file=sys.stderr)
            sys.exit(1)
        print("已推送到 GitHub，等待 Actions 自动发布（约 1 分钟）")


# ---------------------------------------------------------------------------

def main():
    p = argparse.ArgumentParser(prog="blog.py", description="blog · wym 博客内容管理工具")
    sub = p.add_subparsers(dest="cmd", required=True)

    q = sub.add_parser("new", help="新建一篇文章")
    q.add_argument("title", help="文章标题")
    q.add_argument("--tags", default="随笔", help="逗号分隔的标签，如 数学,算法")
    q.add_argument("--slug", default="", help="文件名（slug），默认由标题生成")
    q.set_defaults(fn=cmd_new)

    q = sub.add_parser("serve", help="本地预览")
    q.add_argument("--port", type=int, default=8000)
    q.set_defaults(fn=cmd_serve)

    q = sub.add_parser("check", help="校验所有文章")
    q.set_defaults(fn=cmd_check)

    q = sub.add_parser("build", help="重建索引 / RSS / 站点地图")
    q.set_defaults(fn=cmd_build)

    q = sub.add_parser("publish", help="提交改动并推送")
    q.add_argument("message", nargs="?", default="chore: 更新博客", help="提交说明")
    q.add_argument("--push", action="store_true", help="提交后推送到 GitHub")
    q.set_defaults(fn=cmd_publish)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
