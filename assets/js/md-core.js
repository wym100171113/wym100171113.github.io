/* ==========================================================================
   md-core — Markdown → HTML 的共享渲染核心
   浏览器（classic script 直载，挂 globalThis.MDCore）与 Node（require）
   用的是同一份实现，保证「预渲染产物」与「运行时兜底渲染」逐字节同源——
   否则两边各写一套，迟早出现同篇文章两条路径渲染结果不一致的幽灵 bug。

   零依赖：marked 由宿主注入（浏览器 <script> 标签 / Node 里 require 后挂
   globalThis.marked），本文件只负责「数学公式保护 + 调用 + 还原 + 标题锚点」。
   ========================================================================== */
(function (root, factory) {
  const api = factory();
  /* Node / CommonJS（tools/prerender.mjs 走这条）；浏览器走 else 挂全局 */
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MDCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* 不写 window.marked：Node 里没有 window，预渲染时会静默退化成 <pre> 包原文 */
  const markedLib = () => (typeof globalThis !== "undefined" ? globalThis.marked : null);

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
        const M = markedLib();
        return M ? M.parse(m.raw) : esc(m.raw);
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
    const M = markedLib();
    if (!M || markedReady) return;
    markedReady = true;
    M.setOptions({ gfm: true, breaks: false });
  }

  /* Markdown → HTML。marked 缺席时退化成 <pre> 原文，至少不白屏 */
  function mdToHtml(md) {
    const M = markedLib();
    if (!M) return `<pre>${esc(md)}</pre>`;
    ensureMarked();
    const { md: protectedMd, stash } = protectMath(md);
    return restoreMath(M.parse(protectedMd), stash);
  }

  /* FNV-1a 32 位：短、稳定、无依赖。只用来给同名标题消歧，不需要抗碰撞强度 */
  function shortHash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36).slice(0, 4);
  }

  /* 标题文本 → id 主体：CJK 原样保留（中文锚点可读、可分享），
     空白转连字符，ASCII 小写化，其余标点丢弃 */
  function slugify(text) {
    return String(text || "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff-]/g, "")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
  }

  /* 给缺 id 的 h1–h4 补【稳定】id（幂等：已有 id 的一律不动）。
     不用位置编号 sec-1/sec-2 —— 那会随正文增删整体错位，所有外部深链与
     读者收藏的锚点会集体失效。改成由标题文本派生：同一标题在任何时候、
     任何页面（运行时渲染或预渲染）都得到同一个 id。 */
  function headingIds(rootEl, opts) {
    if (!rootEl || !rootEl.querySelectorAll) return;
    const tags = (opts && opts.tags) || ["h1", "h2", "h3", "h4"];
    const nodes = Array.from(rootEl.querySelectorAll(tags.join(",")));   // 天然按文档顺序
    /* 先登记全部既有 id：预渲染产物可能已自带 id，新生成的不能撞上去 */
    const used = Object.create(null);
    nodes.forEach((el) => { if (el.id) used[el.id] = true; });
    nodes.forEach((el) => {
      if (el.id) return;
      const text = (el.textContent || "").trim();
      const base = slugify(text) || "sec";
      const id = `${base}-${shortHash(text)}`;
      let final = id, n = 2;
      while (used[final]) final = `${id}-${n++}`;
      used[final] = true;
      el.id = final;
    });
  }

  return { protectMath, restoreMath, mdToHtml, headingIds };
});
