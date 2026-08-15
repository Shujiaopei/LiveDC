/**
 * 对比图分类色板（dataviz 验证过的 8 槽位，固定顺序，不循环）：
 * 明暗两套为同一组色相的各自步进，浅色面与深色面分别选用。
 */
export const SLOT_COLORS = {
  light: [
    "#2a78d6", // 蓝
    "#eb6834", // 橙
    "#1baf7a", // 青
    "#eda100", // 黄
    "#e87ba4", // 品红
    "#008300", // 绿
    "#4a3aa7", // 紫
    "#e34948", // 红
  ],
  dark: [
    "#3987e5",
    "#d95926",
    "#199e70",
    "#c98500",
    "#d55181",
    "#008300",
    "#9085e9",
    "#e66767",
  ],
} as const

export type ThemeName = keyof typeof SLOT_COLORS

/** 槽位 → 当前主题下的颜色；槽位只取 0..7 */
export function slotColor(slot: number, theme: ThemeName): string {
  const list = SLOT_COLORS[theme]
  return list[Math.min(slot, list.length - 1)]
}
