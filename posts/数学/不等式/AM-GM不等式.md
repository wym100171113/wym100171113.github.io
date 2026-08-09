---
title: AM-GM不等式
date: 2026-08-09
tags:
  - 数学
  - 不等式
excerpt: 最基本的不等式
---
$$a_{1}, a_{2}, \cdots, a_{n}>0,\frac{a_{1}+a_{2}+\cdots+a_{n}}{n} \geq \sqrt[n]{a_{1} a_{2} \cdots a_{n}}$$
$$\newline\frac{1}{n} \sum_{k=1}^{n} a_{k} \geq \sqrt[n]{\prod_{k=1}^{n} a_{k}}$$
## 证明:
当$n=2$时,不等式成立是容易看到的,这是由于$$(a_1+a_2)^2=a_1^2+2a_1a_2+a_2^2\geq 4a_1a_2$$两边同除以 $4$ 再开方即得结果。

由这个简单的结果，我们可以推广地证明不等式对所有 $n=2^k(k=1,2,\cdots)$ 也成立，事实上只需要把这 $2^k$ 项不断地二分然后反复利用前述结果就够了，比如
$$\frac{a_1+a_2+a_3+a_4}{4}\geq \frac{2\sqrt{a_1a_2}+2\sqrt{a_3a_4}}{4}\geq\sqrt[4]{a_1a_2a_3a_4}$$
现在，我们只需再证明 $n\neq 2^k$ 时的情形。由于对每一个这样的 $n$ 都可以找到 $2^{k-1},2^k$ 将它夹住，即 $2^{k-1}\leq n<2^k(k=1,2,\cdots).$ 这时，记 $\sqrt[n]{a_1a_2\cdots a_n}=\tilde{a},$ 则将有
$$\frac{a_1+\cdots+a_n+\overbrace{\tilde{a}+\cdots+\tilde{a}}^{2^k-n}}{2^k}\geq (a_1\cdots a_n\cdot \tilde{a}\cdots \tilde{a})^{\frac{1}{2^k}}$$
亦即
$$\frac{a_1+\cdots+a_n+(2^k-n)\tilde{a}}{2^k}\geq (\tilde{a}^n\cdot \tilde{a}^{2^k-n})^{\frac{1}{2^k}}$$
整理即得

$$\frac{a_1+a_2+\cdots+a_n}{n}\geq \tilde{a}$$ 
这就得证了。