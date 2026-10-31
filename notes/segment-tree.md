---
title: 线段树入门
tags: 树结构, 区间查询, 线段树
updated: 2026-10-31
---

# 线段树入门

> 一句话：把区间一层层二分，用一棵树维护区间信息，支持区间查询与单点/区间修改。

## 适用场景

- 需要频繁「区间求和 / 区间最值 / 区间修改」。
- 数组长度 1e5 级别，操作 1e5 级别，暴力会 TLE。

## 结构

数组存树：节点 `p` 的左右儿子是 `2p` 和 `2p+1`，节点维护区间 `[l, r]` 的答案。

```cpp
const int N = 100010;
int a[N];
long long tree[N * 4];

void build(int p, int l, int r) {
    if (l == r) { tree[p] = a[l]; return; }
    int mid = (l + r) >> 1;
    build(p * 2, l, mid);
    build(p * 2 + 1, mid + 1, r);
    tree[p] = tree[p * 2] + tree[p * 2 + 1];
}

void add(int p, int l, int r, int pos, int val) {
    if (l == r) { tree[p] += val; return; }
    int mid = (l + r) >> 1;
    if (pos <= mid) add(p * 2, l, mid, pos, val);
    else add(p * 2 + 1, mid + 1, r, pos, val);
    tree[p] = tree[p * 2] + tree[p * 2 + 1];
}

long long query(int p, int l, int r, int ql, int qr) {
    if (ql <= l && r <= qr) return tree[p];
    int mid = (l + r) >> 1;
    long long res = 0;
    if (ql <= mid) res += query(p * 2, l, mid, ql, qr);
    if (qr > mid) res += query(p * 2 + 1, mid + 1, r, ql, qr);
    return res;
}
```

## 复杂度

| 操作 | 复杂度 |
| --- | --- |
| build | O(n) |
| 单点修改 | O(log n) |
| 区间查询 | O(log n) |

## 常见坑

- 数组开 `4n`，开 `n` 会越界。
- 递归边界写成半开区间 `[l, r)` 时，`mid` 和判断条件都要跟着改。
- 多组数据记得清空 `tree`。

## 练习

[洛谷 · 数据结构题单](https://www.luogu.com.cn/training/113)
