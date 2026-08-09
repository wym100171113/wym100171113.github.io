---
title: 文章标题
date: 2026-08-09
tags: [随笔]
excerpt: 在这里写一两句话作为摘要，它会显示在首页文章列表里。
---

正文从这里开始。

支持完整的 Markdown 语法：**粗体**、*斜体*、`行内代码`、[链接](https://example.com)。

## 二级标题

一段普通的文字。中文与英文之间会自动留出一点间距，行高也调得比较宽松，读起来不累。

- 列表项一
- 列表项二
- 列表项三

> 引用一段话，会带一条朱红色的左边线。

## 代码块

```python
def greet(name):
    return f"你好，{name}！"

print(greet("世界"))
```

## 图片

图片请放到 `assets/img/` 目录，然后这样引用：

![一张示意图片](assets/img/example.png)

---

写完之后，保存即可。如果用了 `tools/newpost.py`，索引会自动更新；否则记得在 `posts/index.json` 里加一条对应的记录。
