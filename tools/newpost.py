#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
新建一篇博客文章。
用法:
    python3 tools/newpost.py "我的新文章"           # 自动生成 slug
    python3 tools/newpost.py "我的新文章" my-post   # 指定 slug

它会:
  1. 在 posts/ 下创建 <slug>.md（从 posts/template.md 复制并填好日期）
  2. 在 posts/index.json 中追加一条记录（按日期保持最新在前）

依赖: 仅 Python 3 标准库。
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POSTS_DIR = ROOT / "posts"
TEMPLATE = POSTS_DIR / "template.md"
MANIFEST = POSTS_DIR / "index.json"


def slugify(text: str) -> str:
    s = text.strip().lower()
    s = re.sub(r"[^\w\s-]", "", s, flags=re.UNICODE)
    s = re.sub(r"[\s_]+", "-", s)
    return re.sub(r"-+", "-", s).strip("-") or f"post-{date.today().isoformat()}"


def main(argv):
    if len(argv) < 2 or not argv[1].strip():
        print(__doc__)
        sys.exit(1)
    title = argv[1].strip()
    slug = argv[2].strip() if len(argv) > 2 and argv[2].strip() else slugify(title)

    # 中文等非 ASCII 标题退化为日期 slug，避免文件名不可读
    if not re.match(r"^[a-z0-9-]+$", slug):
        slug = f"post-{date.today().isoformat()}"

    target = POSTS_DIR / f"{slug}.md"
    if target.exists():
        print(f"已存在: {target.relative_to(ROOT)}（跳过创建）")
    else:
        text = TEMPLATE.read_text(encoding="utf-8")
        text = text.replace("title: 文章标题", f"title: {title}")
        text = text.replace("date: 2026-08-09", f"date: {date.today().isoformat()}")
        target.write_text(text, encoding="utf-8")
        print(f"已创建: {target.relative_to(ROOT)}")

    # 更新索引
    data = []
    if MANIFEST.exists():
        try:
            data = json.loads(MANIFEST.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print("警告: index.json 解析失败，已重置为空列表。", file=sys.stderr)
    entry = {
        "slug": slug,
        "title": title,
        "date": date.today().isoformat(),
        "tags": ["随笔"],
        "excerpt": "",
    }
    data = [e for e in data if e.get("slug") != slug]
    data.insert(0, entry)
    data.sort(key=lambda e: e.get("date", ""), reverse=True)
    MANIFEST.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"已更新索引: {MANIFEST.relative_to(ROOT)}")
    print(f"\n下一步: 编辑 {target.relative_to(ROOT)} 写正文，然后 git 推送。")


if __name__ == "__main__":
    main(sys.argv)
