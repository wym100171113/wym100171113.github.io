/* ==========================================================================
   余白 · Yohaku blog — 前端逻辑
   主题切换 / 首页 / 文章渲染（marked + KaTeX + highlight.js + TOC）/ 归档
   ========================================================================== */

(() => {
  "use strict";

  const CONFIG = {
    siteName: "余白",
    tagline: "把复杂的，讲得漂亮。",
    // 首页「随手记」——想改修改这里即可
    thoughts: [
      { text: "好的界面是让人注意不到界面的界面。", time: "最近" },
      { text: "写东西最开心的一刻，是自己终于把复杂的事讲明白了。", time: "前些天" },
      { text: "留白不是空着，是把最重要的东西显出来。", time: "很久以前" },
    ],
  };

  const MANIFEST = "posts/index.json";
  const THEME_KEY = "yohaku-theme-v2";

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------------- 日期 ---------------- */
  const MONTHS_ZH = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
  const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const parseDate = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? null : d;
  };
  const zhDate = (iso) => {
    const d = parseDate(iso);
    return d ? `${d.getFullYear()} 年 ${MONTHS_ZH[d.getMonth()]} 月 ${d.getDate()} 日` : iso;
  };
  const shortDate = (iso) => {
    const d = parseDate(iso);
    return d ? `${MONTHS_ZH[d.getMonth()]} 月 ${d.getDate()} 日` : iso;
  };
  const enDate = (iso) => {
    const d = parseDate(iso);
    return d ? `${MONTHS_EN[d.getMonth()]} ${d.getDate()}` : iso;
  };

  /* ---------------- 数据 ---------------- */
  async function getPosts() {
    const res = await fetch(MANIFEST, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json())
      .filter((p) => p && p.slug && p.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  function postUrl(slug) {
    return `post.html?id=${encodeURIComponent(slug)}`;
  }

  /* ---------------- 主题与顶栏 ---------------- */
  function initTheme() {
    const root = document.documentElement;
    const saved = localStorage.getItem(THEME_KEY);
    const theme = saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    root.setAttribute("data-theme", theme);
    const btn = $("#themeBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", next);
        localStorage.setItem(THEME_KEY, next);
      });
    }
  }

  function initHeader() {
    const h = $("#siteHeader");
    if (!h) return;
    const fn = () => h.classList.toggle("scrolled", window.scrollY > 12);
    window.addEventListener("scroll", fn, { passive: true });
    fn();
  }

  /* ---------------- 滚动显现 ---------------- */
  function initReveal() {
    $$(".reveal").forEach((el) => el.classList.add("js-wait"));
    if (!("IntersectionObserver" in window)) {
      $$(".reveal").forEach((el) => el.classList.add("rise"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("rise");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.08 });
    $$(".reveal").forEach((el) => io.observe(el));
  }

  /* ---------------- 首页 ---------------- */
  async function renderHome() {
    const main = $("#main");
    let posts;
    try {
      posts = await getPosts();
    } catch (e) {
      main.innerHTML = `<div class="status err">读取文章列表失败：${esc(e.message)}</div>`;
      return;
    }

    const recent = posts.slice(0, 5);
    const nth = posts.length;

    main.innerHTML = `
      <section class="hero">
        <p class="kicker rise">The Aha Moments</p>
        <h1 class="rise" style="animation-delay:.08s">
          <span class="cn">把想法，写下来。</span>
          <span class="en">Write it down.</span>
        </h1>
        <p class="lede rise" style="animation-delay:.16s">
          这里，是我的笔记本——关于 <b>数学</b>、<b>代码</b> 与 <b>有趣的想法</b>。把复杂的，讲得漂亮。
        </p>
        <div class="hero-stats rise" style="animation-delay:.24s">
          <div><b>${nth}</b><span class="unit"> 篇文章</span></div>
          <div><b>${recent.length ? new Date(recent[0].date).getFullYear() : "—"}</b><span class="unit"> 最近更新</span></div>
          <div><b>${CONFIG.tagline}</b></div>
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <h2><span class="zh">最近文章</span>Recent Writing</h2>
          <a class="more" href="archive.html">全部文章</a>
        </div>
        <div class="post-list" data-part="list"></div>
      </section>

      <section class="section">
        <div class="section-head">
          <h2><span class="zh">随手记</span>Thinking</h2>
        </div>
        <ul class="thoughts" data-part="thoughts"></ul>
      </section>`;

    const listBox = $('[data-part="list"]', main);
    if (recent.length === 0) {
      listBox.outerHTML = `
        <div class="empty rise">
          <p>还没有文章。试试 <code>python3 tools/blog.py new "我的第一篇"</code></p>
        </div>`;
    } else {
      listBox.innerHTML = recent.map((p, i) => `
        <article class="post-row reveal" style="animation-delay:${0.06 * i}s">
          <time class="p-date">${esc(shortDate(p.date))}</time>
          <div>
            <div class="p-meta"><span class="p-cat">${esc(p.category)}</span></div>
            <h3><a href="${postUrl(p.slug)}">${esc(p.title)}</a></h3>
            ${p.excerpt ? `<p class="p-excerpt">${esc(p.excerpt)}</p>` : ""}
            <span class="p-readmore">Read more</span>
          </div>
        </article>`).join("");
    }

    $('[data-part="thoughts"]', main).innerHTML = CONFIG.thoughts.map((t) => `
      <li class="reveal">
        <p>${esc(t.text)}</p>
        <time>${esc(t.time)}</time>
      </li>`).join("");

    initReveal();
  }

  /* ---------------- 文章页 ---------------- */
  function parseFrontmatter(md) {
    const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    const meta = {};
    if (m) {
      m[1].split(/\r?\n/).forEach((line) => {
        const i = line.indexOf(":");
        if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      });
      if (meta.tags) {
        try { meta.tags = JSON.parse(meta.tags.replace(/'/g, '"')); }
        catch { meta.tags = meta.tags.replace(/[\[\]]/g, "").split(",").map((s) => s.trim()).filter(Boolean); }
      }
    }
    return { meta, body: m ? m[2].trim() : md };
  }

  async function renderPost() {
    const main = $("#main");
    const id = new URLSearchParams(location.search).get("id") ||
               new URLSearchParams(location.search).get("slug");
    if (!id) {
      main.innerHTML = `<div class="status err">缺少文章参数（?id=…）</div>`;
      return;
    }
    main.innerHTML = `<div class="status">载入中…</div>`;

    let posts = [];
    try { posts = await getPosts(); } catch { /* ignore */ }
    const info = posts.find((p) => p.slug === id);
    const idx = posts.findIndex((p) => p.slug === id);

    let md;
    try {
      const res = await fetch(`posts/${encodeURIComponent(id)}.md`, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      md = await res.text();
    } catch (e) {
      main.innerHTML = `<div class="status err">找不到文章 <code>${esc(id)}</code>（${esc(e.message)}）<br><a class="back-link" href="archive.html">← 返回归档</a></div>`;
      return;
    }

    const { meta, body } = parseFrontmatter(md);
    const title = meta.title || (info && info.title) || id;
    const date = meta.date || (info && info.date) || "";
    const tags = (meta.tags && meta.tags.length ? meta.tags : (info && info.tags)) || [];
    const cat = tags[0] || (info && info.category) || "随笔";
    const readTime = info && info.readTime ? info.readTime : "";
    const prev = idx >= 0 && idx < posts.length - 1 ? posts[idx + 1] : null;
    const next = idx > 0 ? posts[idx - 1] : null;

    document.title = `${title} · ${CONFIG.siteName}`;

    /* Markdown → HTML，并给标题编号以便生成目录 */
    let html;
    if (window.marked) {
      marked.setOptions({ gfm: true, breaks: false });
      html = marked.parse(body);
    } else {
      html = `<pre>${esc(body)}</pre>`;
    }

    const toc = [];
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    let n = 0;
    $$("h2, h3", tmp).forEach((h) => {
      const id = `sec-${++n}`;
      h.id = id;
      toc.push({ id, text: h.textContent, sub: h.tagName === "H3" });
    });
    html = tmp.innerHTML;

    main.innerHTML = `
      <div class="read-progress"><i id="readBar"></i></div>
      <section class="post-head">
        <a class="back-link" href="archive.html">← 返回归档</a>
        <span class="p-cat">${esc(cat)}</span>
        <h1>${esc(title)}</h1>
        <div class="meta">
          <span class="d">${esc(zhDate(date))}</span>
          ${readTime ? `<span>阅读约 ${esc(readTime)}</span>` : ""}
          ${tags.length ? `<span class="d">#</span>` : ""}
        </div>
      </section>

      <section class="post-body-layout">
        <article class="post-content">
          <div class="prose" id="prose">${html}</div>

          <div class="post-foot">
            ${tags.length ? `<div class="post-tags">${tags.map((t) => `<a href="archive.html?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join("")}</div>` : ""}
            <nav class="pn-nav">
              ${prev
                ? `<a href="${postUrl(prev.slug)}"><small>上一篇</small><span>${esc(prev.title)}</span></a>`
                : `<span class="end"></span>`}
              ${next
                ? `<a class="next" href="${postUrl(next.slug)}"><small>下一篇</small><span>${esc(next.title)}</span></a>`
                : `<span class="end next"></span>`}
            </nav>
          </div>
        </article>

        <aside class="toc">
          <p class="toc-title">本页目录</p>
          <nav id="tocNav">${toc.map((h) => `<a href="#${h.id}"${h.sub ? ' class="sub"' : ""}>${esc(h.text)}</a>`).join("")}</nav>
        </aside>
      </section>`;

    /* KaTeX 数学公式 */
    if (window.renderMathInElement) {
      try {
        renderMathInElement($("#prose"), {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "\\(", right: "\\)", display: false },
          ],
          throwOnError: false,
        });
      } catch (e) { /* noop */ }
    }

    /* 代码高亮 */
    if (window.hljs) {
      $$("#prose pre code").forEach((b) => {
        try { hljs.highlightElement(b); } catch (e) { /* noop */ }
      });
    }

    /* 阅读进度 */
    const bar = $("#readBar");
    if (bar) {
      const onScroll = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width = `${max > 0 ? ((window.scrollY / max) * 100).toFixed(1) : 0}%`;
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }

    /* 目录高亮 */
    const tocLinks = $$("#tocNav a");
    if (tocLinks.length) {
      const onToc = () => {
        let cur = "";
        $$("#prose h2, #prose h3").forEach((el) => {
          if (el.getBoundingClientRect().top <= 140) cur = el.id;
        });
        tocLinks.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === `#${cur}`));
      };
      window.addEventListener("scroll", onToc, { passive: true });
      onToc();
    }
  }

  /* ---------------- 归档页 ---------------- */
  async function renderArchive() {
    const main = $("#main");
    let posts;
    try {
      posts = await getPosts();
    } catch (e) {
      main.innerHTML = `<div class="status err">读取归档失败：${esc(e.message)}</div>`;
      return;
    }

    const q = (new URLSearchParams(location.search).get("q") || "").trim();
    const tag = (new URLSearchParams(location.search).get("tag") || "").trim();

    /* 标签计数 */
    const tagCount = {};
    posts.forEach((p) => (p.tags || []).forEach((t) => { tagCount[t] = (tagCount[t] || 0) + 1; }));
    const tags = Object.keys(tagCount).sort((a, b) => tagCount[b] - tagCount[a] || a.localeCompare(b));

    const kw = q.toLowerCase();
    const filtered = posts.filter((p) => {
      if (tag && !(p.tags || []).includes(tag)) return false;
      if (q && !`${p.title} ${p.excerpt} ${(p.tags || []).join(" ")}`.toLowerCase().includes(kw)) return false;
      return true;
    });

    const byYear = {};
    filtered.forEach((p) => {
      const y = p.date ? String(new Date(p.date).getFullYear()) : "未知";
      (byYear[y] ||= []).push(p);
    });
    const years = Object.keys(byYear).sort((a, b) => b.localeCompare(a));

    main.innerHTML = `
      <section class="page-head">
        <h1>归档 <span class="zh-sub">Posts</span></h1>
        <p class="sub">
          共 <b>${posts.length}</b> 篇文章
          ${q || tag ? `，筛选后 <b>${filtered.length}</b> 篇（<a class="clear-f" href="archive.html">清空筛选</a>）` : "，按年份整理如下"}。
        </p>
      </section>

      <div class="layout-2col">
        <div class="archive-main">
          <div class="filter-bar">
            <div class="search-box">
              <span class="s-icon">⌕</span>
              <input id="qInput" type="search" placeholder="搜标题 / 摘要 / 标签…" value="${esc(q)}">
            </div>
            ${tags.length ? `<div class="tag-chips" id="chips">${tags.map((t) =>
              `<button class="tag-chip${t === tag ? " on" : ""}" data-tag="${esc(t)}">${esc(t)} · ${tagCount[t]}</button>`
            ).join("")}</div>` : ""}
          </div>

          ${years.length === 0
            ? `<div class="empty"><p>没有匹配的文章，试试别的关键词？</p></div>`
            : years.map((y) => `
              <section class="year-block reveal">
                <h2 class="year-title"><b>${esc(y)}</b><span class="count">${byYear[y].length} 篇</span></h2>
                ${byYear[y].map((p) => `
                  <div class="arc-row">
                    <span class="d">${esc(enDate(p.date))}</span>
                    <span class="t"><a href="${postUrl(p.slug)}">${esc(p.title)}</a></span>
                  </div>`).join("")}
              </section>`).join("")}
        </div>

        <aside class="archive-side">
          <div class="side-card">
            <h3>关于本站</h3>
            <p class="who">余白 · Yohaku</p>
            <p>${esc(CONFIG.tagline)}。记录数学、代码与有趣的想法的笔记本。</p>
          </div>
          <div class="side-card">
            <h3>订阅</h3>
            <a class="side-link" href="feed.xml">RSS 订阅<span>RSS</span></a>
            <a class="side-link" href="sitemap.xml">站点地图<span>Sitemap</span></a>
            <a class="side-link" href="about.html">关于我<span>About</span></a>
          </div>
        </aside>
      </div>`;

    /* 搜索（防抖） */
    const qInput = $("#qInput");
    if (qInput) {
      let timer;
      qInput.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const args = new URLSearchParams(location.search);
          const v = qInput.value.trim();
          if (v) args.set("q", v); else args.delete("q");
          const qs = args.toString();
          history.replaceState(null, "", qs ? `archive.html?${qs}` : "archive.html");
          location.reload();
        }, 350);
      });
    }

    /* 标签筛选 */
    $$("#chips .tag-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const args = new URLSearchParams(location.search);
        if (btn.dataset.tag === tag) args.delete("tag");
        else args.set("tag", btn.dataset.tag);
        if (q) args.set("q", q);
        const qs = args.toString();
        location.search = qs ? `?${qs}` : "?";
      });
    });

    initReveal();
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    initTheme();
    initHeader();
    const view = $("#main") && $("#main").dataset.view;
    if (view === "home") renderHome();
    else if (view === "post") renderPost();
    else if (view === "archive") renderArchive();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();