/* ==========================================================================
   blog · wym — 前端逻辑
   主题切换 / 首页 / 文章渲染（marked + KaTeX + highlight.js + TOC）/ 归档
   ========================================================================== */

(() => {
  "use strict";

  const CONFIG = {
    siteName: "wym's blog",
    wordmark: "blog",
    tagline: "把复杂的，讲得漂亮。",
    // 首页「随手记」——想改修改这里即可
    thoughts: [
      { text: "好的界面是让人注意不到界面的界面。", time: "最近" },
      { text: "写东西最开心的一刻，是自己终于把复杂的事讲明白了。", time: "前些天" },
      { text: "简洁不是简单，是去掉所有不必要的东西之后剩下的。剩下的，恰恰是为最必要的一次爆发留的。", time: "很久以前" },
    ],
  };

  const MANIFEST = "/posts/index.json";
  const THEME_KEY = "wym-blog-theme";
  /* 画布底色（与各页 head 内联脚本、style.css 的 --paper 三方同步） */
  const THEME_BG = { light: "#fefdfa", dark: "#121214" };

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* 保护数学公式：在交给 marked 之前把 $..$ / $$..$$ 换成占位符，
     避免 marked 把 $F_n$ 这类下划线解析成斜体；渲染 HTML 后再还原。

     顺序很关键：必须【先】把代码（围栏块 + 行内 code）抽走，【再】抽数学。
     否则代码里的 $x$（shell 的 $HOME、模板字符串 ${x}）会被当成公式吃掉，
     restore 后又被 KaTeX auto-render 渲染成数学——代码块被污染。

     代码占位符（\u0000Cn\u0000）与数学占位符（\u0000Mn\u0000）共用一个 stash。
     代码在 restore 时单独交给 marked 解析那段原始源码，得到真正的
     <pre><code> / <code>，复制按钮、hljs 照常工作，代码里的 $ 不进数学管线。 */
  function protectMath(md) {
    const stash = [];
    const push = (obj) => { stash.push(obj); return `\u0000${obj.code ? "C" : "M"}${stash.length - 1}\u0000`; };
    // 1) 先抽代码：围栏块 ``` / ~~~，再行内 code（\1 配对等长反引号）
    md = md.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g, (m) => push({ code: true, raw: m }));
    md = md.replace(/(`+)([\s\S]*?)\1(?!`)/g, (m) => push({ code: true, raw: m }));
    // 2) 再抽数学：display $$..$$ 优先，然后行内 $..$
    md = md.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => push({ display: true, tex }));
    md = md.replace(/\$([^\$\n]+?)\$/g, (_, tex) => push({ display: false, tex }));
    return { md, stash };
  }
  function restoreMath(html, stash) {
    /* 代码块占位符单独成行时，marked 会把它当成普通段落包成 <p>…</p>；
       若不剥掉，restore 后会变成 <p><pre>… 的无效嵌套。先把这层壳去掉。 */
    html = html.replace(/<p>(\u0000C\d+\u0000)<\/p>/g, "$1");
    return html.replace(/\u0000([MC])(\d+)\u0000/g, (_, kind, i) => {
      const m = stash[+i];
      if (!m) return "";
      if (kind === "C") {
        // 代码：单独让 marked 解析这一段原始源码，产出真正的代码块 / 行内 code
        return window.marked ? marked.parse(m.raw) : esc(m.raw);
      }
      // 公式里若有 < 或 &（如 $a<b$），直接插回会被浏览器当 HTML 标签解析；转义后
      // KaTeX auto-render 按 textContent 读取，实体解码后公式不受影响。
      const tex = m.tex.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      return m.display ? `$$${tex}$$` : `$${tex}$`;
    });
  }

  /* marked 配置（只初始化一次） */
  let markedReady = false;
  function ensureMarked() {
    if (!window.marked || markedReady) return;
    markedReady = true;
    marked.setOptions({ gfm: true, breaks: false });
  }

  /* ---------------- 按需加载的外部库 ---------------- */
  /* KaTeX 与 highlight.js 都不小（约 270KB / 120KB），但多数文章只用得上其中一个，
     甚至两个都不用 —— 所以不放在 <head> 里无条件加载，改成读到正文后再决定。
     Promise 按 URL 缓存，同一份库不会重复注入；加载失败清掉缓存以便下次重试。 */
  const LIB = {
    katex: "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js",
    katexRender: "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js",
    hljs: "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.10.0/build/highlight.min.js",
  };
  const libCache = Object.create(null);
  function loadLib(src) {
    if (!libCache[src]) {
      libCache[src] = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => { delete libCache[src]; reject(new Error(`load failed: ${src}`)); };
        document.head.appendChild(s);
      });
    }
    return libCache[src];
  }

  /* ---------------- 日期 ---------------- */
  const MONTHS_ZH = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
  const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  /* 按【本地时区】解析 YYYY-MM-DD。
     不能用 new Date("2026-01-01")：纯日期字符串按 ISO 规则被当作 UTC 午夜，
     而 getFullYear()/getMonth()/getDate() 取的是本地值——UTC 以西的时区
     （如纽约 UTC-5）会退回前一天，跨年时连年份都错（2026-01-01 → 2025 年 12 月 31 日）。
     这里显式用本地时区构造，任何时区的访客看到的都是 frontmatter 里写的那个日期。 */
  const parseDate = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
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
  /* 会话级缓存：归档页渲染层切换时零网络请求；失败自动重置以便重试 */
  let postsPromise = null;
  function getPosts() {
    if (!postsPromise) {
      /* post.html 在 <head> 里已提前发起同一个请求（与 CDN 库并行下载），这里直接复用它；
         首页/归档页没有 __posts，则自己发起。两者都套同一段解析链。 */
      postsPromise = (window.__posts || fetch(MANIFEST, { cache: "no-cache" }))
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((list) => list.filter((p) => p && p.slug && p.date)
          /* 日期是 YYYY-MM-DD，字典序即时间序，不必绕 Date */
          .sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))))
        /* 失败时两个缓存都要清：postsPromise 是本会话的，__posts 是 post.html
           在 <head> 里预发的那个。只清前者的话，文章页重试会一直复用同一个
           已失败的 Promise，必须整页刷新才能恢复 */
        .catch((e) => { postsPromise = null; window.__posts = null; throw e; });
    }
    return postsPromise;
  }

  /* ---------------- 正文缓存 ---------------- */
  /* 每次进文章页都要拉一次 .md。GitHub Pages 给 .md 的缓存期很短，于是即便有 ETag，
     每次访问仍要走一个网络往返（304 也得等）。这里用 Cache API 存一份原文：
     命中就立即渲染，同时后台悄悄拉新版回来 —— 下次访问自然是最新的
     （stale-while-revalidate）。不用 Service Worker，caches 在主线程就能用。
     注意它只在 https / localhost 下存在，没有就安静退化成普通请求，绝不因为缓存坏了读不了文章。 */
  const MD_CACHE = "wym-md-v1";

  async function fetchMd(url) {
    const fromNetwork = () =>
      fetch(url, { cache: "no-cache" }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      });

    if (!("caches" in window)) return fromNetwork();

    try {
      const cache = await caches.open(MD_CACHE);
      const hit = await cache.match(url);
      if (hit) {
        /* 先给缓存的，再后台更新；下次访问即拿到最新。
           必须显式 no-cache：默认模式下这次请求会被 HTTP 缓存命中
           （GitHub Pages 给 .md 的是 max-age=600），等于把同一份旧内容
           又写回 Cache API 一遍，"后台更新"实际不生效 */
        fetch(url, { cache: "no-cache" })
          .then((r) => (r.ok ? cache.put(url, r.clone()) : null))
          .catch(() => {});
        return hit.text();
      }
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      /* 写缓存失败（配额不足等）不该影响本次阅读，所以只吞掉，不 await */
      cache.put(url, res.clone()).catch(() => {});
      return res.text();
    } catch {
      return fromNetwork();
    }
  }

  function postUrl(slug) {
    return `post.html?id=${encodeURIComponent(slug)}`;
  }

  /* ---------------- 主题与顶栏 ---------------- */
  /* 应用主题：读 localStorage → 设 data-theme（与按钮绑定分离，供 bfcache 恢复时重放） */
  function applyTheme() {
    const root = document.documentElement;
    const saved = localStorage.getItem(THEME_KEY);
    const t = saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    root.setAttribute("data-theme", t);
    root.style.background = THEME_BG[t] || "";
    root.style.colorScheme = t;
  }

  function initTheme() {
    applyTheme();
    const btn = $("#themeBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        /* 切换瞬间禁用页眉的 backdrop-filter：它依赖实时采样，背景色突变时会重采样
           闪一帧。加个短暂类让它在这 320ms 里变成纯背景色过渡，切完再恢复。 */
        document.documentElement.classList.add("theme-switching");
        document.documentElement.setAttribute("data-theme", next);
        document.documentElement.style.background = THEME_BG[next] || "";
        document.documentElement.style.colorScheme = next;
        localStorage.setItem(THEME_KEY, next);
        clearTimeout(initTheme._t);
        initTheme._t = setTimeout(() => {
          document.documentElement.classList.remove("theme-switching");
        }, 320);
      });
    }
  }

  /* bfcache 恢复时脚本不会重跑：A 深色 → B 改浅色 → 返回 A，必须重放主题，
     否则恢复的是离开时冻结的旧主题（back/forward 缓存陈腐问题） */
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) applyTheme();
  });

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
    const lastYear = (() => { const d = recent.length && parseDate(recent[0].date); return d ? d.getFullYear() : "—"; })();

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
          <div><b>${lastYear}</b><span class="unit">最近更新</span></div>
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
          /* 与 tools/blog.py 的 parse_frontmatter 对齐：剥掉成对包裹的引号。
             否则 title: "…" 会把引号一起显示在页面上（Python 侧会剥，两边必须一致） */
          if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value[value.length - 1] === value[0]) {
            value = value.slice(1, -1);
          }
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

  /* 骨架屏写在 post.html 里（延迟淡入的时机见 .skeleton 样式），
     这里不必生成——下面渲染出结果时整块替换 main，它自然就消失了 */

  async function renderPost() {
    const main = $("#main");
    const id = new URLSearchParams(location.search).get("id") ||
               new URLSearchParams(location.search).get("slug");
    if (!id) {
      main.innerHTML = `<div class="status err">缺少文章参数（?id=…）</div>`;
      return;
    }
    /* main 里现在是 post.html 写好的骨架屏，先原样留着；
       下面无论渲染出结果还是报错，都是整块替换，骨架屏随之消失 */

    let posts = [];
    try { posts = await getPosts(); } catch { /* ignore */ }
    const info = posts.find((p) => p.slug === id);
    const idx = posts.findIndex((p) => p.slug === id);
    const folder = (info && info.folder) || "";

    let md;
    const mdPath = folder
      ? `/posts/${folder.split("/").map(encodeURIComponent).join("/")}/${encodeURIComponent(id)}.md`
      : `/posts/${encodeURIComponent(id)}.md`;
    try {
      md = await fetchMd(mdPath);
    } catch (e) {
      main.innerHTML = `<div class="status err">找不到文章 <code>${esc(id)}</code>（${esc(e.message)}）<br><a class="back-link" href="/archive.html">← 返回归档</a></div>`;
      return;
    }

    const { meta, body } = parseFrontmatter(md);
    if (String(meta.status || "").toLowerCase() === "draft") {
      main.innerHTML = `<div class="status err">这是一篇草稿，尚未发布。<br><a class="back-link" href="/archive.html">← 返回归档</a></div>`;
      return;
    }
    /* 按需加载：读到手稿才知道用不用得上 ——
       有公式（$ 或 \( \[）才要 KaTeX，有围栏代码块才要 highlight.js。
       这里只发起、不等待，让它和后面的解析／构建 DOM 并行；真正用到时再 await。 */
    const libsReady = Promise.all([
      /\\\(|\\\[|\$/.test(body) ? loadLib(LIB.katex).then(() => loadLib(LIB.katexRender)) : null,
      /^[ \t]*```/m.test(body) ? loadLib(LIB.hljs) : null,
    ].filter(Boolean)).catch(() => {});

    const title = meta.title || (info && info.title) || id;
    const date = meta.date || (info && info.date) || "";
    const tags = (meta.tags && meta.tags.length ? meta.tags : (info && info.tags)) || [];
    const cat = tags[0] || (info && info.category) || "随笔";
    const readTime = info && info.readTime ? info.readTime : "";
    const prev = idx >= 0 && idx < posts.length - 1 ? posts[idx + 1] : null;
    const next = idx > 0 ? posts[idx - 1] : null;

    document.title = `${title} · ${CONFIG.siteName}`;

    /* Markdown → HTML，并给标题编号以便生成目录 */
    /* rawHtml 是 marked 的原始输出；下面 tmp 会被逐层加工（链接改写、callout、
       标题归一化…），加工后的结果另存为 finalHtml——两者含义不同，别共用一个名字 */
    let rawHtml;
    if (window.marked) {
      ensureMarked();
      const { md, stash } = protectMath(body);
      rawHtml = restoreMath(marked.parse(md), stash);
    } else {
      rawHtml = `<pre>${esc(body)}</pre>`;
    }

    const toc = [];
    const tmp = document.createElement("div");
    tmp.innerHTML = rawHtml;

    /* 图片懒加载：长文里绝大多数插图在首屏之外，交给浏览器按需取；
       decoding=async 让解码不阻塞后续渲染 */
    $$("img", tmp).forEach((img) => {
      if (!img.hasAttribute("loading")) img.setAttribute("loading", "lazy");
      img.setAttribute("decoding", "async");
    });

    /* 站内文章链接转译：Obsidian 里站内链接是相对 .md 路径（如 ../代数/韦达定理.md），
       站点上点击会 404。这里把指向 .md（或纯文件名）的链接，与 post.html?id=/slug= 旧写法
       统一换成 post.html?id=文件名 */
    $$("a[href]", tmp).forEach((a) => {
      let href = a.getAttribute("href");
      if (!href) return;
      const old = href.match(/^post\.html\?(?:id|slug)=([^&#]+)/);
      if (old) { a.setAttribute("href", postUrl(old[1])); return; }
      if (/^(https?:|mailto:|tel:|#|javascript:|data:)/i.test(href)) return;
      if (/\.(html?|xml|png|jpe?g|gif|svg|webp|pdf|zip|css|js)([?#]|$)/i.test(href)) return;
      const bare = href.replace(/[?#].*$/, "");
      const file = bare.split("/").pop();
      if (!file) return;
      const isMd = /\.md$/i.test(bare);
      const hasExt = /\.[a-z0-9]{1,6}$/i.test(bare);
      if (!isMd && (hasExt || !/^[\w\u4e00-\u9fff-]+$/.test(file))) return;
      a.setAttribute("href", postUrl(file.replace(/\.md$/i, "")));
    });

    /* Obsidian 附件路径转译：Obsidian 里图片是相对笔记文件的 vault 相对路径（vault=posts/），
       站点渲染页在根目录。这里把 vault 相对路径换算成站点根相对路径：
       按 ../ 级数上溯、按笔记所在文件夹深度归位，统一指向 posts/ 下的附件。
       例如（笔记在 posts/数学/代数/ 下）：../../assets/img/x.png → posts/assets/img/x.png */
    $$("img[src]", tmp).forEach((img) => {
      /* Obsidian 图片尺寸语法：![alt|宽] 或 ![alt|宽x高]，从 alt 中解析并应用显示尺寸 */
      const alt = img.getAttribute("alt") || "";
      const size = alt.match(/\|(\d+)(?:x(\d+))?\s*$/);
      if (size) {
        img.setAttribute("alt", alt.slice(0, size.index).trim());
        img.style.width = `${size[1]}px`;
        img.style.height = size[2] ? `${size[2]}px` : "auto";
      }
      let src = img.getAttribute("src");
      if (!src) return;
      if (/^(https?:|data:|blob:)/i.test(src)) return;
      const segs = folder ? folder.split("/") : [];
      let rest = src;
      let up = 0;
      while (rest.startsWith("../")) { up++; rest = rest.slice(3); }
      if (rest.startsWith("/")) rest = rest.slice(1);
      const dir = segs.slice(0, Math.max(0, segs.length - up));
      img.setAttribute("src", "/" + ["posts", ...dir, rest].filter(Boolean).join("/"));
    });

    /* Obsidian callout：把 > [!type] 块引用转成 callout */
    $$("blockquote", tmp).forEach((bq) => {
      const firstP = bq.firstElementChild;
      if (!firstP || firstP.tagName !== "P") return;
      // GFM 会把 callout 的标题与正文合并进同一个 <p>，用换行切分。
      // 第 2 组的空白只能是空格/制表符：写成 \s* 会把换行一起吃掉，
      // 于是「> [!detail]」后另起一行写的正文会被当成标题，正文整段消失
      const m = firstP.innerHTML.match(/^\[!([a-zA-Z]+)\]((?:-|\+)?[ \t]*)?([^\n]*)([\s\S]*)$/);
      if (!m) return;
      const type = m[1].toLowerCase();
      const titleHTML = m[3].trim();
      const bodyHTML = m[4];
      const marker = (m[2] || "").trim();
      /* detail：技术附录专用，默认折叠（除非显式 +）；其他类型：带 - 默认折叠，带 +/- 可折叠 */
      const collapsible = type === "detail" ? marker !== "+" : /[-+]/.test(marker);
      const collapsed = type === "detail" ? marker !== "+" : marker === "-";
      firstP.remove();
      const div = document.createElement("div");
      div.className = `callout callout-${type}`;
      const titleP = document.createElement("p");
      titleP.className = "callout-title";
      titleP.innerHTML = titleHTML || esc(type);
      div.appendChild(titleP);
      if (collapsible) {
        div.classList.add("is-collapsible");
        if (collapsed) div.classList.add("is-collapsed");
      }
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
      /* 折叠 callout（技术附录）里的标题不进目录：折叠时锚点无法跳转，
         且附录排在文末会让目录顺序看起来错乱。id 仍保留，展开后可手动深链 */
      if (h.closest(".callout.is-collapsible")) return;
      toc.push({
        id,
        text: h.textContent,
        depth: Math.min(HEADING_TAGS.indexOf(h.tagName.toLowerCase()) - 1, 2), // h2→0, h3→1, h4+→2
      });
    });
    const finalHtml = tmp.innerHTML;

    main.innerHTML = `
      <section class="post-head rise">
        <a class="back-link" href="/archive.html">← 返回归档</a>
        <span class="p-cat">${esc(cat)}</span>
        ${folder ? `<a class="p-folder" href="/archive.html?folder=${encodeURIComponent(folder)}">${esc(folder.replace(/\//g, " / "))}</a>` : ""}
        <h1>${esc(title)}</h1>
        <div class="meta">
          <span class="d">${esc(zhDate(date))}</span>
          ${readTime ? `<span>阅读约 ${esc(readTime)}</span>` : ""}
          ${tags.length ? `<span class="d">#</span>` : ""}
        </div>
      </section>

      <section class="post-body-layout rise${toc.length ? "" : " no-toc"}" style="animation-delay:.06s">
        <article class="post-content">
          <div class="prose" id="prose">${finalHtml}</div>

          <div class="post-foot">
            ${tags.length ? `<div class="post-tags">${tags.map((t) => `<a href="/archive.html?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join("")}</div>` : ""}
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

    /* callout 折叠（事件委托——tmp 序列化为 HTML 会丢失监听器，必须绑定在真实 DOM 上） */
    $("#prose").addEventListener("click", (e) => {
      const t = e.target.closest(".callout.is-collapsible .callout-title");
      if (!t) return;
      const c = t.closest(".callout");
      if (c) c.classList.toggle("is-collapsed");
      /* 展开改变后续标题位置，主动触发 scroll 监听器让阅读进度/目录高亮立即重算 */
      window.dispatchEvent(new Event("scroll"));
    });

    /* KaTeX 数学公式（$..$ 行内 / $$..$$ 独立 / \(..\) 与 \[..\] 兼容） */
    /* 等库就位再渲染公式（文章没有公式时，libsReady 已经是已 resolve 的空 Promise） */
    await libsReady;
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

    /* 正文图片：点击放大（灯箱缩放/平移） */
    initImgZoom();

    /* 代码高亮（mermaid 交给 mermaid.js，跳过）。
       libsReady 在上面已经 await 过，同一个 Promise 不必重复 await */
    if (window.hljs) {
      $$("#prose pre code").forEach((b) => {
        if (b.className && String(b.className).includes("language-mermaid")) return;
        try { hljs.highlightElement(b); } catch (e) { /* noop */ }
      });
    }

    /* 代码块复制按钮（mermaid 块会被替换为图表，跳过） */
    initCopyButtons();

    /* Mermaid 图表（按需加载：正文里出现 mermaid 代码块才注入脚本，其余页面零开销） */
    const mmdBlocks = $$("#prose pre code.language-mermaid");
    if (mmdBlocks.length) {
      const renderMmd = () => {
        try {
          mermaid.initialize({ startOnLoad: false, securityLevel: "loose", theme: "default", themeVariables: { background: "transparent" } });
        } catch (e) { /* noop */ }
        let mmd = 0;
        mmdBlocks.forEach((el) => {
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
      };
      if (window.mermaid) renderMmd();
      else {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";
        s.onload = renderMmd;
        s.onerror = () => { /* 加载失败则保留原代码块 */ };
        document.head.appendChild(s);
      }
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
    const tocNav = $("#tocNav");
    const tocLinks = tocNav ? $$("#tocNav a", tocNav) : [];
    if (tocLinks.length) {
      const onToc = () => {
        let cur = "", hit = null;
        $$("#prose h2, #prose h3, #prose h4").forEach((el) => {
          /* 折叠 callout 内的标题：display:none 时 rect 全 0 会误判为"正在阅读"；
             展开阅读附录时也跳过，让高亮保持在主结构（与目录口径一致） */
          if (!el.offsetParent || el.closest(".callout.is-collapsible")) return;
          if (el.getBoundingClientRect().top <= 140) cur = el.id;
        });
        tocLinks.forEach((a) => {
          const on = a.getAttribute("href") === `#${cur}`;
          a.classList.toggle("on", on);
          if (on) hit = a;
        });
        /* 目录比一屏长时：挂上 .is-scrollable（触发上下渐隐），
           并把高亮项带进它自己的可视区（只动目录，不碰页面滚动） */
        const scrollable = tocNav.scrollHeight > tocNav.clientHeight;
        tocNav.classList.toggle("is-scrollable", scrollable);
        if (hit && scrollable) {
          const nr = tocNav.getBoundingClientRect(), ar = hit.getBoundingClientRect();
          if (ar.top < nr.top) tocNav.scrollTop -= nr.top - ar.top + 10;
          else if (ar.bottom > nr.bottom) tocNav.scrollTop += ar.bottom - nr.bottom + 10;
        }
      };
      window.addEventListener("scroll", onToc, { passive: true });
      /* 图片/GIF 加载与 mermaid 替换会改变标题位置，资源就绪后重算一次 */
      window.addEventListener("load", onToc);
      onToc();
    }

    /* 页面元数据与当前文章同步（便于支持 JS 渲染的搜索引擎抓取标题/简介） */
    const excerpt = meta.excerpt || (info && info.excerpt) || "";
    /* post.html 只预置了 description / og:title / og:description；
       og:url 与 og:image 需要时现建——只 setAttribute 的话，标签不存在就静默跳过，
       这两行等于没写（分享到社交平台时拿不到缩略图） */
    const setMeta = (sel, val) => {
      let el = document.querySelector(sel);
      if (!el) {
        const parsed = /^meta\[(name|property)="([^"]+)"\]$/.exec(sel);
        if (!parsed) return;
        el = document.createElement("meta");
        el.setAttribute(parsed[1], parsed[2]);
        document.head.appendChild(el);
      }
      el.setAttribute("content", val);
    };
    setMeta('meta[name="description"]', excerpt);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', excerpt);
    setMeta('meta[property="og:url"]', `${location.origin}/post.html?id=${encodeURIComponent(id)}`);
    const firstImg = $("#prose img");
    if (firstImg) {
      let src = firstImg.getAttribute("src");
      if (src && !/^(https?:|data:|blob:)/i.test(src)) {
        src = new URL(src, location.origin).href;
      }
      if (src) setMeta('meta[property="og:image"]', src);
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
    box.addEventListener("click", () => openLightbox(box.querySelector("svg")));
  }

  /* 正文图片 / 表格点击放大（复用灯箱） */
  function initImgZoom() {
    $$("#prose img, #prose table").forEach((el) => {
      el.addEventListener("click", () => openLightbox(el));
    });
  }

  function openLightbox(el) {
    if (!el) return;
    const overlay = document.createElement("div");
    overlay.className = "mmd-lightbox";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="mmd-stage"><div class="mmd-zoom"></div></div>
      <button class="mmd-close" aria-label="关闭">×</button>`;
    const stage = $(".mmd-stage", overlay);
    const zoom = $(".mmd-zoom", overlay);
    const clone = el.cloneNode(true);
    if (el.tagName === "IMG") clone.removeAttribute("style");   // 去掉 |宽x高 的内联尺寸，灯箱里全尺寸显示
    zoom.appendChild(clone);

    let scale = 1, tx = 0, ty = 0;
    const apply = () => { zoom.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; };
    const stageCenter = (cx, cy) => {
      const r = stage.getBoundingClientRect();
      return { x: cx - r.left - r.width / 2, y: cy - r.top - r.height / 2 };
    };
    /* 以某点为中心缩放 */
    const zoomAt = (ns, px, py) => {
      const c = stageCenter(px, py);
      tx = c.x - (c.x - tx) * (ns / scale);
      ty = c.y - (c.y - ty) * (ns / scale);
      scale = ns;
      apply();
    };

    const onWheel = (e) => {
      e.preventDefault();
      zoomAt(Math.min(12, Math.max(1, scale * Math.exp(-e.deltaY * 0.0015))), e.clientX, e.clientY);
    };

    /* 多点触控：单指拖拽，双指捏合缩放；轻点检测（单指 + 位移小 + 抬起时无其他手指） */
    const pointers = new Map();
    let dragging = false, sx = 0, sy = 0, pinchStart = null;
    let tapId = null, tapX = 0, tapY = 0, lastTap = 0, suppressDblClick = 0;
    const mid = () => {
      const pts = [...pointers.values()];
      return {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2,
        dist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
      };
    };
    const onDown = (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      zoom.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        pinchStart = { ...mid(), scale, tx, ty };
        dragging = false;
        tapId = null;
        return;
      }
      tapId = e.pointerId; tapX = e.clientX; tapY = e.clientY;
      dragging = true;
      sx = e.clientX - tx; sy = e.clientY - ty;
      zoom.classList.add("grabbing");
    };
    const onMove = (e) => {
      if (!pointers.has(e.pointerId)) return;
      if (tapId === e.pointerId && Math.hypot(e.clientX - tapX, e.clientY - tapY) > 8) tapId = null;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinchStart) {
        const m = mid();
        const r = stage.getBoundingClientRect();
        const cx = m.x - r.left - r.width / 2;
        const cy = m.y - r.top - r.height / 2;
        const ns = Math.min(12, Math.max(1, pinchStart.scale * (m.dist / Math.max(pinchStart.dist, 1))));
        tx = cx - (cx - pinchStart.tx) * (ns / pinchStart.scale);
        ty = cy - (cy - pinchStart.ty) * (ns / pinchStart.scale);
        scale = ns;
        apply();
      } else if (dragging) {
        tx = e.clientX - sx; ty = e.clientY - sy;
        apply();
      }
    };
    const onUp = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size === 1) {
        const [p] = pointers.values();
        sx = p.x - tx; sy = p.y - ty;
        dragging = true;
      } else if (pointers.size === 0) {
        dragging = false;
        pinchStart = null;
      }
      zoom.classList.remove("grabbing");
    };

    /* 双击：放大到 2.5 倍（已放大则复位）。触屏只在"干净轻点"时判定，
       避免双指捏合抬起被误判成双击而复位 */
    const toggle = (e) => {
      if (scale > 1.1) {
        scale = 1; tx = 0; ty = 0;
      } else {
        zoomAt(2.5, e.clientX, e.clientY);
      }
      apply();
    };
    const onTap = (e) => {
      if (e.pointerType !== "touch") return;
      if (tapId !== e.pointerId || pointers.size !== 0) return;
      const now = Date.now();
      if (now - lastTap < 320) {
        suppressDblClick = now;
        toggle(e);
        lastTap = 0;
      } else {
        lastTap = now;
      }
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
    zoom.addEventListener("pointerup", onTap);
    zoom.addEventListener("dblclick", (e) => {
      if (Date.now() - suppressDblClick < 400) return;   // 触屏双击已处理，跳过原生 dblclick
      toggle(e);
    });
    overlay.addEventListener("click", (e) => { if (e.target === overlay || e.target === stage) close(); });
    $(".mmd-close", overlay).addEventListener("click", close);
    document.addEventListener("keydown", onKey);

    document.body.appendChild(overlay);
    document.body.classList.add("mmd-locked");
  }

  /* ---------------- 归档页 ---------------- */
  /* 渲染层切换：更新 URL（可分享/可后退）→ 全量重渲染 → 恢复滚动位置。
     URL 是唯一状态源，renderArchive 从 URL 参数恢复一切状态。 */
  let isSwitch = false; // 本次渲染是否为页内切换（用于过渡动画）
  function switchView(href, replace = false) {
    const url = new URL(href, location.href);
    const target = url.pathname.split("/").pop() + url.search + url.hash;
    const cur = location.pathname.split("/").pop() + location.search + location.hash;
    if (target === cur) return; // 无变化不重渲染
    const y = window.scrollY;
    isSwitch = true;
    history[replace ? "replaceState" : "pushState"](null, "", target);
    renderArchive().then(() => window.scrollTo(0, y));
  }

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
    /* "只看散篇"与"某个分类"是互斥的：散篇的定义就是"没有 folder"，
       两个条件同时生效只会得到空集。所以指定了 folder 就忽略 unfiled——
       顺带让早先版本生成过的 archive.html?unfiled=1&folder=… 这类旧链接不再白屏 */
    const unfiled = !folder && new URLSearchParams(location.search).get("unfiled") === "1";
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
      if (unfiled) args.set("unfiled", "1");
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

    /* 文件夹排序：同级按「子树内最新一篇的日期」倒序；无文章的（空文件夹）垫底；同日并列按名字 */
    const newestOf = (node) => {
      let d = null;
      for (const p of node.posts) if (!d || p.date > d) d = p.date;
      for (const c of Object.values(node.children)) {
        const cd = newestOf(c);
        if (cd && (!d || cd > d)) d = cd;
      }
      return d;
    };
    const sortKids = (node) => Object.values(node.children).sort((a, b) => {
      const da = newestOf(a), db = newestOf(b);
      if (da && db && da !== db) return da < db ? 1 : -1;
      if (da && !db) return -1;
      if (!da && db) return 1;
      return a.name.localeCompare(b.name, "zh");
    });
    /* 仅直接文章的最近日期（「散篇」块只展示未归档文章，排序键不能用整棵子树） */
    const newestDirect = (node) => {
      let d = null;
      for (const p of node.posts) if (!d || p.date > d) d = p.date;
      return d;
    };
    const treeHTML = (node) => {
      const kids = sortKids(node);
      if (!kids.length) return "";
      const sub = treeHTMLInner(kids);
      return sub ? `<div class="tree-sub"><div class="tree-sub-inner">${sub}</div></div>` : "";
    };
    const treeHTMLInner = (kids) => `<ul class="folder-tree">${kids.map((c) => {
      const hasKids = (x) => x.children && Object.keys(x.children).length;
      return `
        <li class="${hasKids(c) ? "has-children" : ""}">
          ${hasKids(c) ? `<button class="tree-fold" aria-label="折叠">▾</button>` : ""}
          <a href="${makeURL({ folder: c.path, page: "", unfiled: "" })}"${folder === c.path ? ' class="on"' : ""}>${esc(c.name)}<span>${c.count}</span></a>
          ${hasKids(c) ? `<div class="tree-sub"><div class="tree-sub-inner">${treeHTMLInner(sortKids(c))}</div></div>` : ""}
        </li>`;
    }).join("")}</ul>`;

    const kw = q.toLowerCase();
    const filtered = posts.filter((p) => {
      if (unfiled && p.folder) return false;
      if (tag && !(p.tags || []).includes(tag)) return false;
      if (q && !`${p.title} ${p.excerpt || ""} ${(p.tags || []).join(" ")} ${p.folder || ""}`.toLowerCase().includes(kw)) return false;
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
        const d = parseDate(p.date);
        const y = d ? String(d.getFullYear()) : "未知";
        (byY[y] ||= []).push(p);
      }
      return Object.keys(byY).sort((a, b) => b.localeCompare(a)).map((y) => ({ y, list: byY[y] }));
    };
    /* 递归渲染文件夹区块（支持嵌套：父目录下直接放子目录区块） */
    const sectionHTML = (node, isRoot, noKids = false) => {
      const kids = sortKids(node);
      const key = node.path || "__root__";
      const more = node.posts.length > PAGE_SIZE;
      const shown = more ? node.posts.slice(0, PAGE_SIZE) : node.posts;
      return `
      <section class="folder-block reveal${isRoot ? "" : " folder-node"}" data-folder-key="${esc(key)}"${collapsed.has(key) ? ' data-collapsed="1"' : ""}>
        <h2 class="folder-title">
          <button class="folder-toggle" data-fold="${esc(key)}" aria-label="折叠/展开">▾</button>
          <span class="fpath">${isRoot ? "<b>散篇</b>" : esc(node.name)}</span>
          <span class="count">${isRoot ? node.posts.length : node.count} 篇</span>
          ${more ? `<a class="more" href="${makeURL({ folder: node.path, page: "", unfiled: isRoot ? "1" : "" })}">全部 ${node.posts.length} 篇 →</a>` : ""}
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
      const out = [];
      /* 「散篇」（根目录未归档文章）与顶层文件夹块一起按最新日期参与排序 */
      const blocks = [];
      if (tree.posts.length) blocks.push({ node: tree, label: "散篇", key: newestDirect(tree) });
      sortKids(tree).forEach((c) => blocks.push({ node: c, label: c.name, key: newestOf(c) }));
      blocks.sort((a, b) => {
        const da = a.key, db = b.key;
        if (da && db && da !== db) return da < db ? 1 : -1;
        if (da && !db) return -1;
        if (!da && db) return 1;
        return a.label.localeCompare(b.label, "zh");
      });
      blocks.forEach(({ node }) => out.push(sectionHTML(node, node === tree, node === tree)));
      return out.join("");
    };

    const isFiltered = !!(folder || tag || q || unfiled);

    main.innerHTML = `
      <section class="page-head">
        <h1>归档 <span class="zh-sub">Posts</span></h1>
        <p class="sub" id="arcSub">
          共 <b>${posts.length}</b> 篇文章
          ${folder ? `，分类 <b>${esc(folder.replace(/\//g, " / "))}</b> 下 <b>${filtered.length}</b> 篇（<a class="clear-f" href="archive.html">查看全部</a>）` : ""}
          ${unfiled ? `，只看 <b>散篇</b>（未放入文件夹的文章）共 <b>${filtered.length}</b> 篇（<a class="clear-f" href="archive.html">查看全部</a>）` : ""}
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

    /* 页内切换时给结果区挂过渡动画（初始加载不动画） */
    const arcBox = $("#arcResults");
    if (arcBox && isSwitch) arcBox.classList.add("arc-switch");
    isSwitch = false;

    /* 搜索（防抖，内存过滤不重载页面，保留焦点与光标） */
    const qInput = $("#qInput");
    const resultsBox = $("#arcResults");
    if (qInput && resultsBox) {
      let timer;
      const foldActions = $(".fold-actions");
      qInput.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const v = qInput.value.trim();
          /* 搜索结果为扁平列表，折叠按钮不再适用，随关键词显隐 */
          if (foldActions) foldActions.style.display = v ? "none" : "";
          /* 同步 URL（可分享），不触发重载 */
          const args = new URLSearchParams(location.search);
          if (v) args.set("q", v); else args.delete("q");
          args.delete("page");
          const qs = args.toString();
          history.replaceState(null, "", qs ? `archive.html?${qs}` : "archive.html");

          /* 清空搜索：必须整体重渲染。内存扁平渲染还原不了文件夹视图与分页；
             且此时 URL 已复位，若不重渲染，之后点「清空筛选」会因 URL 无变化被去重跳过 */
          if (!v) {
            renderArchive().then(() => {
              const box = $("#qInput");
              if (box) box.focus();
            });
            return;
          }

          /* 内存中重新筛选并只重渲染结果区 */
          const kw2 = v.toLowerCase();
          const list = posts.filter((p) => {
            if (unfiled && p.folder) return false;
            if (tag && !(p.tags || []).includes(tag)) return false;
            if (folder) {
              const pf = p.folder || "";
              if (pf !== folder && !pf.startsWith(folder + "/")) return false;
            }
            if (v && !`${p.title} ${p.excerpt || ""} ${(p.tags || []).join(" ")} ${p.folder || ""}`.toLowerCase().includes(kw2)) return false;
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
          resultsBox.classList.remove("arc-switch");
          void resultsBox.offsetWidth; // 强制 reflow，让动画可重新触发
          resultsBox.classList.add("arc-switch");
          const sub = $("#arcSub");
          if (sub) sub.innerHTML = `共 <b>${posts.length}</b> 篇文章，筛选后 <b>${list.length}</b> 篇（<a class="clear-f" href="archive.html">清空筛选</a>）。`;
        }, 250);
      });
    }

    /* 标签筛选（保留 folder，重置页码；必须清掉 unfiled——
       "散篇"与"某个分类"是互斥的，两个参数并存只会得到 0 篇） */
    $$("#chips .tag-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const args = new URLSearchParams(location.search);
        if (btn.dataset.tag === tag) args.delete("tag");
        else args.set("tag", btn.dataset.tag);
        if (q) args.set("q", q);
        if (folder) args.set("folder", folder);
        args.delete("unfiled");
        args.delete("page");
        const qs = args.toString();
        switchView(qs ? `archive.html?${qs}` : "archive.html");
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
    set("year", posts.length && parseDate(posts[0].date) ? parseDate(posts[0].date).getFullYear() : "—");
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

    /* 归档页渲染层切换：主区点击委托（一次性绑定；main 元素跨渲染复用，不能每次 renderArchive 重复挂） */
    const mainEl = $("#main");
    if (mainEl) {
      mainEl.addEventListener("click", (e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // 保留新标签页等原生行为
        if (mainEl.dataset.view !== "archive") return;
        const a = e.target.closest("a");
        if (!a) return;
        const href = a.getAttribute("href") || "";
        if (!/^archive\.html(?:\?|#|$)/.test(href)) return;
        e.preventDefault();
        switchView(href);
      });
      /* 浏览器前进/后退：从 URL 恢复视图 */
      window.addEventListener("popstate", () => {
        if (mainEl.dataset.view !== "archive") return;
        const y = window.scrollY;
        isSwitch = true;
        renderArchive().then(() => window.scrollTo(0, y));
      });
    }

    const view = $("#main") && $("#main").dataset.view;
    if (view === "home") renderHome();
    else if (view === "post") renderPost();
    else if (view === "archive") renderArchive();
    initAboutStats();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();