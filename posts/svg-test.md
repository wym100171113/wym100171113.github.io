---
title: 内联 SVG 渲染测试
date: 2026-08-14
tags: [测试]
excerpt: 验证内联 SVG 在站点与 Obsidian 中的渲染效果。
status: draft
---

本文验证几类内联 SVG 的渲染表现。

## 一、主题自适应（currentColor）

线条颜色跟随正文文字颜色：浅色模式为黑、深色模式为白。勾股定理 $a^2 + b^2 = c^2$：

<svg viewBox="0 0 260 180" width="360" role="img" aria-label="勾股定理示意图">
  <g fill="none" stroke="currentColor" stroke-width="1.6">
    <polygon points="20,150 20,60 110,60" />
    <rect x="20" y="60" width="90" height="90" transform="rotate(-90 20 60)" fill="rgba(59,130,246,0.08)" stroke-dasharray="4 3"/>
    <rect x="20" y="60" width="127" height="127" transform="rotate(45 20 60)" fill="rgba(59,130,246,0.08)" stroke-dasharray="4 3"/>
    <rect x="20" y="60" width="90" height="90" transform="rotate(0 20 60)" fill="rgba(59,130,246,0.08)" stroke-dasharray="4 3"/>
  </g>
  <g font-family="Georgia, serif" font-size="15" fill="currentColor" font-style="italic">
    <text x="12" y="115">a</text>
    <text x="62" y="48">b</text>
    <text x="118" y="112">c</text>
  </g>
</svg>

## 二、固定颜色（站点强调蓝）

不随主题变化的蓝色线条，两种模式下都清晰：

<svg viewBox="0 0 220 120" width="300">
  <g fill="none" stroke="#3b82f6" stroke-width="2">
    <path d="M10,100 C 60,20 140,20 210,100" />
    <path d="M10,100 L 210,100" stroke-dasharray="5 4" />
  </g>
  <circle cx="110" cy="100" r="3" fill="#3b82f6"/>
  <text x="40" y="90" font-size="12" fill="#3b82f6">y = x²</text>
</svg>

## 三、带标注的简单几何

<svg viewBox="0 0 200 200" width="260">
  <g stroke="currentColor" stroke-width="1.5" fill="none">
    <circle cx="100" cy="100" r="70"/>
    <line x1="30" y1="100" x2="170" y2="100"/>
    <line x1="100" y1="30" x2="100" y2="170"/>
  </g>
  <circle cx="100" cy="100" r="2.5" fill="currentColor"/>
  <g font-size="13" fill="currentColor" font-family="Georgia, serif">
    <text x="106" y="97">O</text>
    <text x="174" y="104">A</text>
    <text x="88" y="26">B</text>
  </g>
</svg>

结论：内联 SVG 渲染正常。
