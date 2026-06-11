# tabBar 图标

> 本目录需放 8 个 PNG 图标（4 个 tab × 2 状态）：
> - `home.png` / `home-active.png`
> - `sport.png` / `sport-active.png`
> - `mall.png` / `mall-active.png`
> - `mine.png` / `mine-active.png`

## 规格

- **尺寸**：建议 81×81 px（高 DPI）或 162×162 px
- **格式**：PNG（透明背景）
- **未选中色**：`#999999`
- **选中色**：`#0FAF8E`（青沐品牌色）
- **风格**：线性 icon（细线），与微信原生视觉对齐

## 占位生成（开发期用）

如果你没拿到设计稿，可以跑：

```bash
node generate-icons.mjs
```

会生成 8 个 **64×64 的彩色方块** 作为占位（丑但能跑通 tabBar 编译）。**真上线前** 替换为设计师出的正式图标。

## 设计师交付物清单

- [ ] `home.png` + `home-active.png`
- [ ] `sport.png` + `sport-active.png`
- [ ] `mall.png` + `mall-active.png`
- [ ] `mine.png` + `mine-active.png`
- [ ] 风格稿 1 张（避免之后扩展 tab 时风格不一致）

## 临时关闭 tabBar 图标警告

如果只想编译过、暂不要图标：

1. `app.json` 的 `tabBar.list` 里把 `iconPath` / `selectedIconPath` 删掉（会显示无图标的纯文字 tabBar）
2. 或者在开发者工具 → 详情 → 本地设置 → 「不校验合法域名」+ 忽略图标警告

**正式版必须有图标**，否则审核可能被退。
