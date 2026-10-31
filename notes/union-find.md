---
title: 并查集
tags: 图论, 并查集, 入门
updated: 2026-10-31
---

# 并查集

> 一句话：维护「元素属于哪个集合」，支持近乎 O(1) 的合并与查询。

## 核心操作

- `find(x)`：找根，带**路径压缩**，把沿途节点直接挂到根上。
- `merge(a, b)`：按**集合大小**合并，把小的挂到大的下面。

两者一起用，单次操作的均摊复杂度是 O(α(n))（α 是反阿克曼函数，实际可视为常数）。

## 模板

```cpp
const int N = 100010;
int fa[N], sz[N];

void init(int n) {
    for (int i = 1; i <= n; i++) fa[i] = i, sz[i] = 1;
}

int find(int x) {
    return fa[x] == x ? x : fa[x] = find(fa[x]);  // 路径压缩
}

void merge(int a, int b) {
    a = find(a), b = find(b);
    if (a == b) return;
    if (sz[a] < sz[b]) swap(a, b);               // 按大小合并
    fa[b] = a;
    sz[a] += sz[b];
}
```

## 复杂度

| 操作 | 均摊复杂度 |
| --- | --- |
| find | O(α(n)) |
| merge | O(α(n)) |
| 初始化 | O(n) |

## 常见坑

- `find` 里忘了 `fa[x] =` 做路径压缩，长链会退化成 O(n)。
- 多组数据忘记重新 `init`。
- 合并时先 `find` 再比较，直接比 `fa[a]` 会错。

## 练习

[洛谷 · 数据结构题单](https://www.luogu.com.cn/training/113)
