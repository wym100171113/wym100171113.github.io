/* ==========================================================================
   墨笺 blog — front-end logic
   - renders header-active state, theme toggle
   - home: reads posts/index.json -> list
   - post: reads ?slug= -> fetches posts/<slug>.md -> marked + highlight.js
   - archive: grouped by year, with search
   Posts are authored as Markdown with a tiny YAML frontmatter block.
   ========================================================================== */

(() => {
  "use strict";

  /* ---------- Config (edit here to customise) --------------------------- */
  const CONFIG = {
    // Used for <title> suffix and og tags
    siteName: "墨笺",
    siteTagline: "一个关于数学、代码与偶然想法的笔记本",
    author: "Thomas Wang",
    // Comments via giscus (GitHub Discussions). Off until you fill repo/id.
    comments: {
      enabled: false,
      src: "https://giscus.app/client.js",
      repo: "your-name/your-repo",            // e.g. "thomaswang/blog"
      repoId: "",                              // from giscus.app
      category: "Announcements",
      categoryId: "",                          // from giscus.app
      mapping: "pathname",
      theme: "light",
    },
  };

  const MANIFEST = "posts/index.json";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- Helpers --------------------------------------------------- */
  const fmtDate = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    const m = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
    return `${d.getFullYear()} 年 ${m[d.getMonth()]} 月 ${d.getDate()} 日`;
  };
  const fmtShort = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}.${mm}.${dd}`;
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));

  async function getPosts() {
    const res = await fetch(MANIFEST, { cache: "no-cache" });
    if (!res.ok) throw new Error(`无法读取 ${MANIFEST}`);
    let data = await res.json();
    data = data
      .filter((p) => p && p.slug && p.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    return data;
  }

  function parsePost(md) {
    const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    const meta = {};
    if (m) {
      m[1].split(/\r?\n/).forEach((line) => {
        const i = line.indexOf(":");
        if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      });
      if (meta.tags) {
        try { meta.tags = JSON.parse(meta.tags.replace(/'/g, '"')); }
        catch { meta.tags = meta.tags.replace(/[\[\]]/g, "").split(",").map((s) => s.trim()); }
      }
    }
    return { meta, body: m ? m[2] : md };
  }

  /* ---------- Header / nav active + theme ------------------------------- */
  function initChrome() {
    const path = location.pathname.split("/").pop() || "index.html";
    $$(".site-nav a").forEach((a) => {
      const href = a.getAttribute("href");
      if (href === path || (path === "" && href === "index.html")) a.classList.add("active");
    });

    const root = document.documentElement;
    const btn = $(".theme-toggle");
    const stored = localStorage.getItem("ink-theme");
    const preferDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = stored || (preferDark ? "dark" : "light");
    root.setAttribute("data-theme", theme);
    setIcon(theme);
    if (btn) {
      btn.addEventListener("click", () => {
        const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", next);
        localStorage.setItem("ink-theme", next);
        setIcon(next);
      });
    }
  }
  function setIcon(t) {
    const btn = $(".theme-toggle");
    if (btn) btn.textContent = t === "dark" ? "月" : "日";
  }

  /* ---------- Home ------------------------------------------------------ */
  async function renderHome() {
    const main = $("#main");
    main.innerHTML = "";
    let posts;
    try { posts = await getPosts(); }
    catch (e) {
      main.innerHTML = `<div class="status err">读取文章列表失败：${esc(e.message)}。<br>请确认 posts/index.json 存在且格式正确。</div>`;
      return;
    }

    const list = $(".list", main) || main;
    const PER_PAGE = 8;
    const params = new URLSearchParams(location.search);
    let page = parseInt(params.get("page") || "1", 10);
    const pages = Math.max(1, Math.ceil(posts.length / PER_PAGE));
    page = Math.min(Math.max(1, page), pages);
    const slice = posts.slice((page - 1) * PER_PAGE, page * PER_PAGE);

    const head = document.createElement("div");
    head.className = "list-head";
    head.innerHTML = `<span>近期 · Recent</span><span class="count">${posts.length} 篇</span>`;
    main.appendChild(head);

    const wrap = document.createElement("div");
    wrap.className = "list";
    if (slice.length === 0) {
      wrap.innerHTML = `
        <div class="empty">
          <div class="glyph">墨</div>
          <h2>这里还没有文章</h2>
          <p>第一篇文章将从这里开始。新建一篇试试：<br>
          <code>python3 tools/newpost.py "我的第一篇文章"</code></p>
        </div>`;
    } else {
      slice.forEach((p, i) => {
        const item = document.createElement("article");
        item.className = "post-item rise";
        item.style.animationDelay = `${0.05 * i + 0.1}s`;
        const tags = (p.tags || []).map((t) => `<a class="tag" href="archive.html?q=${encodeURIComponent(t)}">${esc(t)}</a>`).join("");
        item.innerHTML = `
          <div class="pdate"><span class="dot"></span>${esc(fmtDate(p.date))}</div>
          <h2 class="ptitle"><a href="post.html?slug=${encodeURIComponent(p.slug)}">${esc(p.title)}</a></h2>
          ${p.excerpt ? `<p class="pexcerpt">${esc(p.excerpt)}</p>` : ""}
          <div class="pfoot">
            <a class="read-more" href="post.html?slug=${encodeURIComponent(p.slug)}">继续阅读</a>
            ${tags ? `<span class="tags">${tags}</span>` : ""}
          </div>`;
        wrap.appendChild(item);
      });
    }
    main.appendChild(wrap);

    if (pages > 1) {
      const pager = document.createElement("nav");
      pager.className = "pager";
      pager.innerHTML = `
        ${page > 1 ? `<a href="?page=${page - 1}">← 较新</a>` : "<span></span>"}
        <span style="color:var(--ink-3)">${page} / ${pages}</span>
        ${page < pages ? `<a href="?page=${page + 1}">较旧 →</a>` : "<span></span>"}`;
      main.appendChild(pager);
    }
  }

  /* ---------- Post ------------------------------------------------------ */
  async function renderPost() {
    const main = $("#main");
    const slug = new URLSearchParams(location.search).get("slug");
    if (!slug) {
      main.innerHTML = `<div class="status err">缺少文章参数 (?slug=…)。</div>`;
      return;
    }
    main.innerHTML = `<div class="status">加载中…</div>`;

    let posts;
    try { posts = await getPosts(); }
    catch { posts = []; }
    const info = posts.find((p) => p.slug === slug);

    let md;
    try {
      const res = await fetch(`posts/${slug}.md`, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      md = await res.text();
    } catch (e) {
      main.innerHTML = `
        <article class="article">
          <div class="crumb"><a href="index.html">← 返回首页</a></div>
          <div class="status err">找不到文章 <code>${esc(slug)}</code>（${esc(e.message)}）。<br>
          请确认 posts/${esc(slug)}.md 存在，且 posts/index.json 中有对应条目。</div>
        </article>`;
      return;
    }

    const { meta, body } = parsePost(md);
    const title = meta.title || (info && info.title) || slug;
    const date = meta.date || (info && info.date) || "";
    const tags = meta.tags || (info && info.tags) || [];

    document.title = `${title} · ${CONFIG.siteName}`;
    setMeta("description", meta.excerpt || (info && info.excerpt) || "");
    setMeta("og:title", title, true);
    setMeta("og:type", "article", true);

    let html;
    if (window.marked) {
      try { html = window.marked.parse(body); }
      catch { html = `<pre>${esc(body)}</pre>`; }
    } else {
      html = `<pre>${esc(body)}</pre>`;
    }

    const tagsHtml = tags.map((t) => `<a class="tag" href="archive.html?q=${encodeURIComponent(t)}">${esc(t)}</a>`).join("");

    main.innerHTML = `
      <article class="article fade">
        <div class="crumb"><a href="index.html">首页</a> / 文章</div>
        <h1 class="title">${esc(title)}</h1>
        <div class="byline">
          <span>${esc(CONFIG.author)}</span>
          <span class="sep">·</span>
          <time>${esc(fmtDate(date))}</time>
          ${tagsHtml ? `<span class="sep">·</span><span class="tags">${tagsHtml}</span>` : ""}
        </div>
        <div class="prose" id="prose">${html}</div>
        <div class="article-foot">
          <a class="back" href="index.html">回到首页</a>
          <a href="archive.html">归档</a>
        </div>
      </article>`;

    // lazy-load images with proper alt fallback
    $$("#prose img").forEach((img) => {
      if (!img.getAttribute("alt")) img.setAttribute("alt", title);
    });

    if (window.hljs) $$("#prose pre code").forEach((b) => { try { window.hljs.highlightElement(b); } catch {} });

    // comments
    if (CONFIG.comments.enabled && CONFIG.comments.categoryId) {
      const c = document.createElement("section");
      c.className = "comments";
      c.innerHTML = `<h3>评论</h3><div class="giscus"></div>`;
      main.appendChild(c);
      const s = document.createElement("script");
      Object.entries({
        src: CONFIG.comments.src,
        "data-repo": CONFIG.comments.repo,
        "data-repo-id": CONFIG.comments.repoId,
        "data-category": CONFIG.comments.category,
        "data-category-id": CONFIG.comments.categoryId,
        "data-mapping": CONFIG.comments.mapping,
        "data-theme": document.documentElement.getAttribute("data-theme"),
        "data-strict": "1",
        crossorigin: "anonymous",
        async: "",
      }).forEach(([k, v]) => s.setAttribute(k, v));
      c.appendChild(s);
    }
  }

  function setMeta(name, content, prop = false) {
    if (!content) return;
    let el = document.head.querySelector(`meta[${prop ? "property" : "name"}="${name}"]`);
    if (!el) { el = document.createElement("meta"); el.setAttribute(prop ? "property" : "name", name); document.head.appendChild(el); }
    el.setAttribute("content", content);
  }

  /* ---------- Archive --------------------------------------------------- */
  async function renderArchive() {
    const main = $("#main");
    main.innerHTML = `<div class="status">加载中…</div>`;
    let posts;
    try { posts = await getPosts(); }
    catch (e) {
      main.innerHTML = `<div class="status err">读取归档失败：${esc(e.message)}</div>`;
      return;
    }

    const params = new URLSearchParams(location.search);
    const q = (params.get("q") || "").trim();
    const filtered = q ? posts.filter((p) =>
      (p.title || "").includes(q) || (p.excerpt || "").includes(q) ||
      (p.tags || []).some((t) => t === q || t.includes(q))) : posts;

    const byYear = {};
    filtered.forEach((p) => {
      const y = new Date(p.date).getFullYear() || "未知";
      (byYear[y] = byYear[y] || []).push(p);
    });
    const years = Object.keys(byYear).sort((a, b) => b.localeCompare(a));

    main.innerHTML = `
      <h1 class="page-title">归档</h1>
      <p class="page-sub">共 ${posts.length} 篇${q ? ` · 搜索 “${esc(q)}” 命中 ${filtered.length} 篇` : ""}</p>
      <div class="search"><span>搜</span><input id="q" type="text" placeholder="标题 / 摘要 / 标签…" value="${esc(q)}"></div>
      <div id="arc"></div>`;

    const arc = $("#arc", main);
    if (years.length === 0) {
      arc.innerHTML = `<div class="empty"><div class="glyph">∅</div><h2>没有匹配的文章</h2><p>换个关键词试试。</p></div>`;
    } else {
      years.forEach((y) => {
        const blk = document.createElement("div");
        blk.className = "year-block";
        blk.innerHTML = `<h2>${esc(y)} <span class="count">${byYear[y].length} 篇</span></h2>`;
        byYear[y].forEach((p) => {
          const row = document.createElement("div");
          row.className = "arc-item";
          row.innerHTML = `
            <span class="d">${esc(fmtShort(p.date))}</span>
            <span class="t"><a href="post.html?slug=${encodeURIComponent(p.slug)}">${esc(p.title)}</a></span>
            <span class="tg">${esc((p.tags || []).join(" / "))}</span>`;
          blk.appendChild(row);
        });
        arc.appendChild(blk);
      });
    }

    $("#q", main).addEventListener("input", (e) => {
      const v = e.target.value.trim();
      const u = v ? `archive.html?q=${encodeURIComponent(v)}` : "archive.html";
      history.replaceState(null, "", u);
    });
    $("#q", main).addEventListener("keydown", (e) => {
      if (e.key === "Enter") location.search = e.target.value.trim() ? `?q=${encodeURIComponent(e.target.value.trim())}` : "";
    });
  }

  /* ---------- Boot ------------------------------------------------------ */
  function boot() {
    initChrome();
    const view = $("#main") && $("#main").dataset.view;
    if (view === "home") renderHome();
    else if (view === "post") renderPost();
    else if (view === "archive") renderArchive();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // expose for advanced users
  window.InkBlog = { CONFIG, getPosts, parsePost };
})();
