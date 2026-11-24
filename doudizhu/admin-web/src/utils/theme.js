export const CHART_COLORS = ['#e9b949', '#35d0e0', '#a78bfa', '#34d399', '#f472b6', '#60a5fa', '#fb923c', '#4ade80']

export const axisLine = { lineStyle: { color: '#2b3a4d' } }
export const splitLine = { lineStyle: { color: 'rgba(110,135,170,0.13)', type: 'dashed' } }
export const axisLabelStyle = { color: '#8496ae', fontSize: 11 }

export const baseGrid = (opts = {}) => ({
  left: 8,
  right: 16,
  top: 42,
  bottom: 6,
  containLabel: true,
  ...opts
})

export const baseTooltip = (opts = {}) => ({
  trigger: 'axis',
  backgroundColor: 'rgba(11,18,30,0.96)',
  borderColor: '#2b3a4d',
  borderWidth: 1,
  padding: [10, 14],
  textStyle: { color: '#e7edf7', fontSize: 12 },
  axisPointer: { type: 'line', lineStyle: { color: '#e9b949', type: 'dashed' } },
  ...opts
})

export const baseLegend = (opts = {}) => ({
  top: 6,
  right: 8,
  itemWidth: 12,
  itemHeight: 8,
  icon: 'roundRect',
  textStyle: { color: '#93a3ba', fontSize: 11 },
  ...opts
})

export const categoryAxis = (data, opts = {}) => ({
  type: 'category',
  data,
  boundaryGap: false,
  axisLine,
  axisTick: { show: false },
  axisLabel: axisLabelStyle,
  ...opts
})

export const valueAxis = (opts = {}) => ({
  type: 'value',
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: axisLabelStyle,
  splitLine,
  ...opts
})

export function numberFormat(value) {
  const n = Number(value) || 0
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)}亿`
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)}万`
  return n.toLocaleString('zh-CN')
}
