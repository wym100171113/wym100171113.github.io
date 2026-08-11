/* ==========================================================================
   blog · wym — 前端逻辑
   主题切换 / 首页 / 文章渲染（marked + KaTeX + highlight.js + TOC）/ 归档
   ========================================================================== */

(() => {
  "use strict";

  const CONFIG = {
    siteName: "wym",
    wordmark: "blog",
    tagline: "把复杂的，讲得漂亮。",
    // 首页「随手记」——想改修改这里即可
    thoughts: [
      { text: "好的界面是让人注意不到界面的界面。", time: "最近" },
      { text: "写东西最开心的一刻，是自己终于把复杂的事讲明白了。", time: "前些天" },
      { text: "简洁不是简单，是去掉所有不必要的东西之后剩下的。剩下的，恰恰是为最必要的一次爆发留的。", time: "很久以前" },
    ],
  };

  const MANIFEST = "posts/index.json";
  const THEME_KEY = "wym-blog-theme";

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* 保护数学公式：在交给 marked 之前把 $..$ / $$..$$ 换成占位符，
     避免 marked 把 $F_n$ 这类下划线解析成斜体；渲染 HTML 后再还原。 */
  function protectMath(md) {
    const stash = [];
    md = md.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
      stash.push({ display: true, tex });
      return `\u0000M${stash.length - 1}\u0000`;
    });
    md = md.replace(/\$([^\$\n]+?)\$/g, (_, tex) => {
      stash.push({ display: false, tex });
      return `\u0000M${stash.length - 1}\u0000`;
    });
    return { md, stash };
  }
  function restoreMath(html, stash) {
    return html.replace(/\u0000M(\d+)\u0000/g, (_, i) => {
      const m = stash[+i];
      return m ? (m.display ? `$$${m.tex}$$` : `$${m.tex}$`) : "";
    });
  }

  /* marked 配置（只初始化一次） */
  let markedReady = false;
  function ensureMarked() {
    if (!window.marked || markedReady) return;
    markedReady = true;
    marked.setOptions({ gfm: true, breaks: false });
  }

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
    const tagSet = new Set();
    posts.forEach((p) => (p.tags || []).forEach((t) => tagSet.add(t)));

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
          <div><b>${nth}</b><span class="unit">篇文章</span></div>
          <div><b>${recent.length ? new Date(recent[0].date).getFullYear() : "—"}</b><span class="unit">最近更新</span></div>
          <div><b>${tagSet.size}</b><span class="unit">个标签</span></div>
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
            <div class="p-meta">
              ${p.folder ? `<a class="p-folder" href="archive.html?folder=${encodeURIComponent(p.folder)}" title="${esc(p.folder)}">${esc(p.folder.split("/").pop())}</a>` : ""}
              <span class="p-cat">${esc(p.category)}</span>
            </div>
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
      const lines = m[1].split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const idx = lines[i].indexOf(":");
        if (idx <= 0) continue;
        const key = lines[i].slice(0, idx).trim();
        let value = lines[i].slice(idx + 1).trim();
        if (key === "tags" && value === "") {
          // YAML 列表格式（Obsidian Properties 默认）
          const items = [];
          while (i + 1 < lines.length && /^\s*-\s*/.test(lines[i + 1])) {
            items.push(lines[i + 1].replace(/^\s*-\s*/, "").trim());
            i++;
          }
          meta.tags = items;
        } else {
          meta[key] = value;
        }
      }
      if (meta.tags && !Array.isArray(meta.tags)) {
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
    const folder = (info && info.folder) || "";

    let md;
    const mdPath = folder
      ? `posts/${folder.split("/").map(encodeURIComponent).join("/")}/${encodeURIComponent(id)}.md`
      : `posts/${encodeURIComponent(id)}.md`;
    try {
      const res = await fetch(mdPath, { cache: "no-cache" });
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
      ensureMarked();
      const { md, stash } = protectMath(body);
      html = restoreMath(marked.parse(md), stash);
    } else {
      html = `<pre>${esc(body)}</pre>`;
    }

    const toc = [];
    const tmp = document.createElement("div");
    tmp.innerHTML = html;

    /* 站内文章链接转译：Obsidian 里站内链接是相对 .md 路径（如 ../代数/韦达定理.md），
       站点上点击会 404。这里把指向 .md（或纯文件名）的链接统一换成 post.html?id=文件名 */
    $$("a[href]", tmp).forEach((a) => {
      let href = a.getAttribute("href");
      if (!href) return;
      if (/^(https?:|mailto:|tel:|#|javascript:|data:)/i.test(href)) return;
      if (/\.(html?|xml|png|jpe?g|gif|svg|webp|pdf|zip|css|js)([?#]|$)/i.test(href)) return;
      const bare = href.replace(/[?#].*$/, "");
      const file = bare.split("/").pop();
      if (!file) return;
      const isMd = /\.md$/i.test(bare);
      const hasExt = /\.[a-z0-9]{1,6}$/i.test(bare);
      if (!isMd && (hasExt || !/^[\w\u4e00-\u9fff-]+$/.test(file))) return;
      a.setAttribute("href", `post.html?id=${encodeURIComponent(file.replace(/\.md$/i, ""))}`);
    });

    /* Obsidian callout：把 > [!type] 块引用转成 callout */
    $$("blockquote", tmp).forEach((bq) => {
      const firstP = bq.firstElementChild;
      if (!firstP || firstP.tagName !== "P") return;
      // GFM 会把 callout 的标题与正文合并进同一个 <p>，用换行切分
      const m = firstP.innerHTML.match(/^\[!([a-zA-Z]+)\]((?:-|\+)?\s*)?([^\n]*)([\s\S]*)$/);
      if (!m) return;
      const type = m[1].toLowerCase();
      const titleHTML = m[3].trim();
      const bodyHTML = m[4];
      firstP.remove();
      const div = document.createElement("div");
      div.className = `callout callout-${type}`;
      const titleP = document.createElement("p");
      titleP.className = "callout-title";
      titleP.innerHTML = titleHTML || esc(type);
      div.appendChild(titleP);
      if (bodyHTML && bodyHTML.trim()) {
        const bodyP = document.createElement("p");
        bodyP.innerHTML = bodyHTML.trim();
        div.appendChild(bodyP);
      }
      while (bq.firstChild) div.appendChild(bq.firstChild);
      bq.replaceWith(div);
    });

    /* 标题归一化 + 目录
       1) 删掉与文章标题重复的正文 h1（避免标题在页面上出现两遍）；
       2) 找出正文最浅的标题层级，整体顺移到 h2 起步（h1 留给页面标题）——
          无论作者用 # 还是 ## 或更深层级，视觉与目录层级都保持一致；
       3) 目录收录归一化后的 h2/h3/h4+（h5/h6 按 h4 平级展示，不再漏掉）；
         所有标题都会拿到锚点 id。 */
    const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"];
    let removedTitleH1 = false;
    $$("h1, h2, h3, h4, h5, h6", tmp).forEach((h) => {
      if (!removedTitleH1 && h.tagName === "H1" && h.textContent.trim() === title.trim()) {
        h.remove();
        removedTitleH1 = true;
      }
    });
    let headings = $$("h1, h2, h3, h4, h5, h6", tmp);
    if (headings.length) {
      const minLv = Math.min(...headings.map((h) => HEADING_TAGS.indexOf(h.tagName.toLowerCase())));
      const shift = minLv === 0 ? 1 : 1 - minLv;   // 最浅一级顺移到 h2，h6 不越界
      headings.forEach((h) => {
        const lv = HEADING_TAGS.indexOf(h.tagName.toLowerCase());
        const tag = HEADING_TAGS[Math.min(lv + shift, 5)];
        if (tag !== h.tagName.toLowerCase()) {
          const nh = document.createElement(tag);
          nh.innerHTML = h.innerHTML;
          h.replaceWith(nh);
        }
      });
      headings = $$("h2, h3, h4", tmp);
    }
    let n = 0;
    headings.forEach((h) => {
      const id = `sec-${++n}`;
      h.id = id;
      toc.push({
        id,
        text: h.textContent,
        depth: Math.min(HEADING_TAGS.indexOf(h.tagName.toLowerCase()) - 1, 2), // h2→0, h3→1, h4+→2
      });
    });
    html = tmp.innerHTML;

    main.innerHTML = `
      <div class="read-progress"><i id="readBar"></i></div>
      <section class="post-head rise">
        <a class="back-link" href="archive.html">← 返回归档</a>
        <span class="p-cat">${esc(cat)}</span>
        ${folder ? `<a class="p-folder" href="archive.html?folder=${encodeURIComponent(folder)}">${esc(folder.replace(/\//g, " / "))}</a>` : ""}
        <h1>${esc(title)}</h1>
        <div class="meta">
          <span class="d">${esc(zhDate(date))}</span>
          ${readTime ? `<span>阅读约 ${esc(readTime)}</span>` : ""}
          ${tags.length ? `<span class="d">#</span>` : ""}
        </div>
      </section>

      <section class="post-body-layout rise${toc.length ? "" : " no-toc"}" style="animation-delay:.06s">
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

        ${toc.length ? `
        <aside class="toc">
          <p class="toc-title">本页目录</p>
          <nav id="tocNav">${toc.map((h) => `<a href="#${h.id}"${h.depth ? ` class="${h.depth === 1 ? "sub" : "sub2"}"` : ""}>${esc(h.text)}</a>`).join("")}</nav>
        </aside>` : ""}
      </section>`;

    /* KaTeX 数学公式（$..$ 行内 / $$..$$ 独立 / \(..\) 与 \[..\] 兼容） */
    if (window.renderMathInElement) {
      try {
        renderMathInElement($("#prose"), {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "\\[", right: "\\]", display: true },
            { left: "\\(", right: "\\)", display: false },
            { left: "$", right: "$", display: false },
          ],
          throwOnError: false,
        });
      } catch (e) { /* noop */ }
    }

    /* 代码高亮（mermaid 交给 mermaid.js，跳过） */
    if (window.hljs) {
      $$("#prose pre code").forEach((b) => {
        if (b.className && String(b.className).includes("language-mermaid")) return;
        try { hljs.highlightElement(b); } catch (e) { /* noop */ }
      });
    }

    /* 代码块复制按钮（mermaid 块会被替换为图表，跳过） */
    initCopyButtons();

    /* Mermaid 图表 */
    if (window.mermaid) {
      try {
        mermaid.initialize({ startOnLoad: false, securityLevel: "loose", theme: "default", themeVariables: { background: "transparent" } });
      } catch (e) { /* noop */ }
      let mmd = 0;
      $$("#prose pre code.language-mermaid").forEach((el) => {
        const code = el.textContent;
        const id = `mmd-${++mmd}-${Date.now()}`;
        (async () => {
          try {
            const { svg } = await mermaid.render(id, code);
            const wrap = document.createElement("div");
            wrap.className = "mermaid";
            wrap.innerHTML = `${svg}<span class="mmd-hint">点击放大</span>`;
            const pre = el.closest("pre");
            if (pre) pre.replaceWith(wrap);
            initMmdZoom(wrap);
          } catch (e) { /* 渲染失败则保留原代码块 */ }
        })();
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
        $$("#prose h2, #prose h3, #prose h4").forEach((el) => {
          if (el.getBoundingClientRect().top <= 140) cur = el.id;
        });
        tocLinks.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === `#${cur}`));
      };
      window.addEventListener("scroll", onToc, { passive: true });
      onToc();
    }
  }

  /* ---------------- 代码块复制按钮 ---------------- */
  function initCopyButtons() {
    $$("#prose pre").forEach((pre) => {
      const code = pre.querySelector("code");
      if (!code) return;
      if (code.className && String(code.className).includes("language-mermaid")) return;

      const wrap = document.createElement("div");
      wrap.className = "code-block";
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "copy-btn";
      btn.textContent = "复制";
      btn.setAttribute("aria-label", "复制代码");
      wrap.appendChild(btn);

      btn.addEventListener("click", async () => {
        const text = code.textContent;
        let ok = false;
        try {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            ok = true;
          }
        } catch (e) { /* fall through */ }
        if (!ok) {
          try {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            ok = document.execCommand("copy");
            ta.remove();
          } catch (e) { /* noop */ }
        }
        if (ok) {
          btn.textContent = "已复制";
          btn.classList.add("done");
          setTimeout(() => {
            btn.textContent = "复制";
            btn.classList.remove("done");
          }, 1600);
        }
      });
    });
  }

  /* ---------------- Mermaid 图表放大（灯箱：滚轮缩放 + 拖拽平移） ---------------- */
  function initMmdZoom(box) {
    box.addEventListener("click", () => openMmdLightbox(box));
  }

  function openMmdLightbox(box) {
    const src = box.querySelector("svg");
    if (!src) return;
    const overlay = document.createElement("div");
    overlay.className = "mmd-lightbox";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="mmd-stage"><div class="mmd-zoom"></div></div>
      <button class="mmd-close" aria-label="关闭">×</button>
      <span class="mmd-tip">滚轮缩放 · 拖拽平移 · 双击复位 · Esc 关闭</span>`;
    const stage = $(".mmd-stage", overlay);
    const zoom = $(".mmd-zoom", overlay);
    zoom.appendChild(src.cloneNode(true));

    let scale = 1, tx = 0, ty = 0;
    const apply = () => { zoom.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; };

    const onWheel = (e) => {
      e.preventDefault();
      const ns = Math.min(12, Math.max(1, scale * Math.exp(-e.deltaY * 0.0015)));
      const r = stage.getBoundingClientRect();
      const cx = e.clientX - r.left - r.width / 2;
      const cy = e.clientY - r.top - r.height / 2;
      tx = cx - (cx - tx) * (ns / scale);
      ty = cy - (cy - ty) * (ns / scale);
      scale = ns;
      apply();
    };

    let dragging = false, sx = 0, sy = 0;
    const onDown = (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragging = true;
      sx = e.clientX - tx; sy = e.clientY - ty;
      zoom.setPointerCapture(e.pointerId);
      zoom.classList.add("grabbing");
    };
    const onMove = (e) => {
      if (!dragging) return;
      tx = e.clientX - sx; ty = e.clientY - sy;
      apply();
    };
    const onUp = () => {
      dragging = false;
      zoom.classList.remove("grabbing");
    };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    const close = () => {
      overlay.remove();
      document.body.classList.remove("mmd-locked");
      document.removeEventListener("keydown", onKey);
    };

    zoom.addEventListener("wheel", onWheel, { passive: false });
    zoom.addEventListener("pointerdown", onDown);
    zoom.addEventListener("pointermove", onMove);
    zoom.addEventListener("pointerup", onUp);
    zoom.addEventListener("pointercancel", onUp);
    zoom.addEventListener("dblclick", () => { scale = 1; tx = 0; ty = 0; apply(); });
    overlay.addEventListener("click", (e) => { if (e.target === overlay || e.target === stage) close(); });
    $(".mmd-close", overlay).addEventListener("click", close);
    document.addEventListener("keydown", onKey);

    document.body.appendChild(overlay);
    document.body.classList.add("mmd-locked");
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
    const folder = (new URLSearchParams(location.search).get("folder") || "").trim();
    const page = Math.max(1, parseInt(new URLSearchParams(location.search).get("page") || "1", 10) || 1);
    const PAGE_SIZE = 15;

    /* 标签计数 */
    const tagCount = {};
    posts.forEach((p) => (p.tags || []).forEach((t) => { tagCount[t] = (tagCount[t] || 0) + 1; }));
    const tags = Object.keys(tagCount).sort((a, b) => tagCount[b] - tagCount[a] || a.localeCompare(b));

    /* 构建归档链接（保留当前筛选，可覆盖/清空参数） */
    const makeURL = (ov) => {
      const args = new URLSearchParams();
      if (q) args.set("q", q);
      if (tag) args.set("tag", tag);
      if (folder) args.set("folder", folder);
      for (const [k, v] of Object.entries(ov || {})) { if (v) args.set(k, v); else args.delete(k); }
      const qs = args.toString();
      return qs ? `archive.html?${qs}` : "archive.html";
    };

    /* 折叠状态（localStorage 持久化） */
    const COLLAPSE_KEY = "wym-blog-collapsed-folders";
    let collapsed = new Set();
    try { collapsed = new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "[]")); } catch { /* ignore */ }
    const toggleCollapse = (k) => {
      if (collapsed.has(k)) collapsed.delete(k); else collapsed.add(k);
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed])); } catch { /* ignore */ }
    };

    /* 文件夹树（侧栏分类 + 主区嵌套分组，可折叠子级） */
    const tree = { name: "", path: "", count: 0, children: {}, posts: [] };
    for (const p of posts) {
      const parts = (p.folder || "").split("/").filter(Boolean);
      let node = tree;
      node.count++;
      for (const part of parts) {
        if (!node.children[part]) {
          node.children[part] = { name: part, path: node.path ? `${node.path}/${part}` : part, count: 0, children: {}, posts: [] };
        }
        node = node.children[part];
        node.count++;
      }
      node.posts.push(p);
    }
    const treeHTML = (node) => {
      const kids = Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name, "zh"));
      if (!kids.length) return "";
      const hasKids = (c) => c.children && Object.keys(c.children).length;
      const sub = treeHTMLInner(kids);
      return sub ? `<div class="tree-sub"><div class="tree-sub-inner">${sub}</div></div>` : "";
    };
    const treeHTMLInner = (kids) => `<ul class="folder-tree">${kids.map((c) => {
      const hasKids = (x) => x.children && Object.keys(x.children).length;
      return `
        <li class="${hasKids(c) ? "has-children" : ""}">
          ${hasKids(c) ? `<button class="tree-fold" aria-label="折叠">▾</button>` : ""}
          <a href="${makeURL({ folder: c.path, page: "" })}"${folder === c.path ? ' class="on"' : ""}>${esc(c.name)}<span>${c.count}</span></a>
          ${hasKids(c) ? `<div class="tree-sub"><div class="tree-sub-inner">${treeHTMLInner(Object.values(c.children).sort((a, b) => a.name.localeCompare(b.name, "zh")))}</div></div>` : ""}
        </li>`;
    }).join("")}</ul>`;

    const kw = q.toLowerCase();
    const filtered = posts.filter((p) => {
      if (tag && !(p.tags || []).includes(tag)) return false;
      if (q && !`${p.title} ${p.excerpt} ${(p.tags || []).join(" ")} ${p.folder || ""}`.toLowerCase().includes(kw)) return false;
      if (folder) {
        const pf = p.folder || "";
        if (pf !== folder && !pf.startsWith(folder + "/")) return false;
      }
      return true;
    });

    /* 分页 */
    const totalPages = (n) => Math.max(1, Math.ceil(n / PAGE_SIZE));
    const cur = Math.min(page, totalPages(filtered.length));
    const pagerHTML = (total, c) => {
      const tp = totalPages(total);
      if (tp <= 1) return "";
      return `
        <nav class="pager">
          <a class="pg" href="${makeURL({ page: c - 1 })}"${c <= 1 ? ' aria-disabled="true" tabindex="-1"' : ""}>← 上一页</a>
          <span class="pg-info">第 ${c} / ${tp} 页 · 共 ${total} 篇</span>
          <a class="pg" href="${makeURL({ page: c + 1 })}"${c >= tp ? ' aria-disabled="true" tabindex="-1"' : ""}>下一页 →</a>
        </nav>`;
    };

    /* 按文件夹分组，组内再按年份 */
    const groupByYear = (list) => {
      const byY = {};
      for (const p of list) {
        const y = p.date ? String(new Date(p.date).getFullYear()) : "未知";
        (byY[y] ||= []).push(p);
      }
      return Object.keys(byY).sort((a, b) => b.localeCompare(a)).map((y) => ({ y, list: byY[y] }));
    };
    /* 递归渲染文件夹区块（支持嵌套：父目录下直接放子目录区块） */
    const sectionHTML = (node, isRoot, noKids = false) => {
      const kids = Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name, "zh"));
      const key = node.path || "__root__";
      const more = !isRoot && node.posts.length > PAGE_SIZE;
      const shown = more ? node.posts.slice(0, PAGE_SIZE) : node.posts;
      return `
      <section class="folder-block reveal${isRoot ? "" : " folder-node"}" data-folder-key="${esc(key)}"${collapsed.has(key) ? ' data-collapsed="1"' : ""}>
        <h2 class="folder-title">
          <button class="folder-toggle" data-fold="${esc(key)}" aria-label="折叠/展开">▾</button>
          <span class="fpath">${isRoot ? "<b>全部文章</b>" : esc(node.name)}</span>
          <span class="count">${isRoot ? node.posts.length : node.count} 篇</span>
          ${more ? `<a class="more" href="${makeURL({ folder: node.path, page: "" })}">全部 ${node.posts.length} 篇 →</a>` : ""}
        </h2>
        <div class="folder-body">
          <div class="folder-body-inner">
            ${groupByYear(shown).map(({ y, list: yl }) => `
              <h3 class="year-title"><b>${esc(y)}</b><span class="count">${yl.length} 篇</span></h3>
              ${yl.map((p) => `
                <div class="arc-row">
                  <span class="d">${esc(enDate(p.date))}</span>
                  <span class="t"><a href="${postUrl(p.slug)}">${esc(p.title)}</a></span>
                </div>`).join("")}
            `).join("")}
            ${noKids ? "" : kids.map((k) => sectionHTML(k, false)).join("")}
          </div>
        </div>
      </section>`;
    };
    const renderOverview = () => {
      const rootKids = Object.values(tree.children).sort((a, b) => a.name.localeCompare(b.name, "zh"));
      const out = [];
      // 全部文章：只放顶层文章，子目录由各自的顶级区块呈现，避免重复
      if (tree.posts.length) out.push(sectionHTML(tree, true, true));
      rootKids.forEach((c) => out.push(sectionHTML(c, false)));
      return out.join("");
    };

    const isFiltered = !!(folder || tag || q);

    main.innerHTML = `
      <section class="page-head">
        <h1>归档 <span class="zh-sub">Posts</span></h1>
        <p class="sub" id="arcSub">
          共 <b>${posts.length}</b> 篇文章
          ${folder ? `，分类 <b>${esc(folder.replace(/\//g, " / "))}</b> 下 <b>${filtered.length}</b> 篇（<a class="clear-f" href="archive.html">查看全部</a>）` : ""}
          ${q || tag ? `，筛选后 <b>${filtered.length}</b> 篇（<a class="clear-f" href="archive.html">清空筛选</a>）` : "，按分类整理如下"}。
        </p>
      </section>

      <div class="layout-2col">
        <div class="archive-main">
          <div class="filter-bar">
            <div class="search-box">
              <span class="s-icon">⌕</span>
              <input id="qInput" type="search" placeholder="搜标题 / 摘要 / 标签 / 分类…" value="${esc(q)}">
            </div>
            ${tags.length ? `<div class="tag-chips" id="chips">${tags.map((t) =>
              `<button class="tag-chip${t === tag ? " on" : ""}" data-tag="${esc(t)}">${esc(t)} · ${tagCount[t]}</button>`
            ).join("")}</div>` : ""}
          </div>

          ${!isFiltered ? `
          <div class="fold-actions">
            <button class="fold-btn" id="expandAllBtn">展开全部</button>
            <button class="fold-btn" id="collapseAllBtn">收起全部</button>
          </div>` : ""}

          <div id="arcResults">
          ${filtered.length === 0
            ? `<div class="empty"><p>没有匹配的文章，试试别的关键词？</p></div>`
            : isFiltered
              ? (() => {
                  const pagePosts = filtered.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
                  return `
                    ${pagerHTML(filtered.length, cur)}
                    ${groupByYear(pagePosts).map(({ y, list: yl }) => `
                      <section class="folder-block reveal">
                        <h3 class="year-title"><b>${esc(y)}</b><span class="count">${yl.length} 篇</span></h3>
                        ${yl.map((p) => `
                          <div class="arc-row">
                            <span class="d">${esc(enDate(p.date))}</span>
                            <span class="t"><a href="${postUrl(p.slug)}">${esc(p.title)}</a></span>
                          </div>`).join("")}
                      </section>`).join("")}
                    ${pagerHTML(filtered.length, cur)}`;
                })()
              : renderOverview()}
          </div>
        </div>

        <aside class="archive-side">
          <div class="side-card">
            <h3>分类</h3>
            <a class="side-link${folder ? "" : " on"}" href="archive.html">全部<span>${posts.length}</span></a>
            ${treeHTML(tree)}
          </div>
          <div class="side-card">
            <h3>关于本站</h3>
            <p class="who">blog · wym</p>
            <p>${esc(CONFIG.tagline)} 记录数学、代码与有趣的想法的笔记本。</p>
          </div>
          <div class="side-card">
            <h3>订阅</h3>
            <a class="side-link" href="feed.xml">RSS 订阅<span>RSS</span></a>
            <a class="side-link" href="sitemap.xml">站点地图<span>Sitemap</span></a>
            <a class="side-link" href="about.html">关于我<span>About</span></a>
          </div>
        </aside>
      </div>`;

    /* 搜索（防抖，内存过滤不重载页面，保留焦点与光标） */
    const qInput = $("#qInput");
    const resultsBox = $("#arcResults");
    if (qInput && resultsBox) {
      let timer;
      qInput.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const v = qInput.value.trim();
          /* 同步 URL（可分享），不触发重载 */
          const args = new URLSearchParams(location.search);
          if (v) args.set("q", v); else args.delete("q");
          args.delete("page");
          const qs = args.toString();
          history.replaceState(null, "", qs ? `archive.html?${qs}` : "archive.html");

          /* 内存中重新筛选并只重渲染结果区 */
          const kw2 = v.toLowerCase();
          const list = posts.filter((p) => {
            if (tag && !(p.tags || []).includes(tag)) return false;
            if (folder) {
              const pf = p.folder || "";
              if (pf !== folder && !pf.startsWith(folder + "/")) return false;
            }
            if (v && !`${p.title} ${p.excerpt} ${(p.tags || []).join(" ")} ${p.folder || ""}`.toLowerCase().includes(kw2)) return false;
            return true;
          });
          resultsBox.innerHTML = list.length === 0
            ? `<div class="empty"><p>没有匹配的文章，试试别的关键词？</p></div>`
            : groupByYear(list).map(({ y, list: yl }) => `
                <section class="folder-block">
                  <h3 class="year-title"><b>${esc(y)}</b><span class="count">${yl.length} 篇</span></h3>
                  ${yl.map((p) => `
                    <div class="arc-row">
                      <span class="d">${esc(enDate(p.date))}</span>
                      <span class="t"><a href="${postUrl(p.slug)}">${esc(p.title)}</a></span>
                    </div>`).join("")}
                </section>`).join("");
          const sub = $("#arcSub");
          if (sub) sub.innerHTML = `共 <b>${posts.length}</b> 篇文章，筛选后 <b>${list.length}</b> 篇（<a class="clear-f" href="archive.html">清空筛选</a>）。`;
        }, 250);
      });
    }

    /* 标签筛选（保留 folder，重置页码） */
    $$("#chips .tag-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const args = new URLSearchParams(location.search);
        if (btn.dataset.tag === tag) args.delete("tag");
        else args.set("tag", btn.dataset.tag);
        if (q) args.set("q", q);
        if (folder) args.set("folder", folder);
        args.delete("page");
        const qs = args.toString();
        location.href = qs ? `archive.html?${qs}` : "archive.html";
      });
    });

    /* 分类区块折叠/展开 */
    $$(".folder-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.fold;
        toggleCollapse(key);
        const block = btn.closest(".folder-block");
        if (block) block.toggleAttribute("data-collapsed");
      });
    });

    /* 展开全部 / 收起全部 */
    const expandAllBtn = $("#expandAllBtn");
    if (expandAllBtn) {
      expandAllBtn.addEventListener("click", () => {
        collapsed.clear();
        try { localStorage.setItem(COLLAPSE_KEY, "[]"); } catch { /* ignore */ }
        $$(".folder-block").forEach((b) => b.removeAttribute("data-collapsed"));
      });
    }
    const collapseAllBtn = $("#collapseAllBtn");
    if (collapseAllBtn) {
      collapseAllBtn.addEventListener("click", () => {
        $$(".folder-block").forEach((b) => {
          const key = b.getAttribute("data-folder-key");
          if (key) collapsed.add(key);
          b.setAttribute("data-collapsed", "1");
        });
        try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed])); } catch { /* ignore */ }
      });
    }

    /* 侧栏分类树折叠 */
    $$(".tree-fold").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const li = btn.closest("li");
        const folded = li.classList.toggle("folded");
        btn.textContent = folded ? "▸" : "▾";
      });
    });

    initReveal();
  }

  /* ---------------- 关于页小统计 ---------------- */
  async function initAboutStats() {
    const box = $("#aboutStats");
    if (!box) return;
    const set = (k, v) => {
      const el = box.querySelector(`[data-k="${k}"]`);
      if (el) el.textContent = v;
    };
    let posts = [];
    try { posts = await getPosts(); } catch { /* ignore */ }
    const tagSet = new Set();
    posts.forEach((p) => (p.tags || []).forEach((t) => tagSet.add(t)));
    set("count", posts.length);
    set("year", posts.length ? new Date(posts[0].date).getFullYear() : "—");
    set("tags", tagSet.size);
    // 仓库 stars（GitHub 公开 API，无需鉴权）
    try {
      const res = await fetch("https://api.github.com/repos/wym100171113/wym100171113.github.io");
      if (res.ok) {
        const repo = await res.json();
        set("stars", repo.stargazers_count ?? 0);
      }
    } catch { /* ignore */ }
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    initTheme();
    initHeader();
    const view = $("#main") && $("#main").dataset.view;
    if (view === "home") renderHome();
    else if (view === "post") renderPost();
    else if (view === "archive") renderArchive();
    initAboutStats();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();