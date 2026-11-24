<template>
  <div ref="chartRef" class="echart-box" :style="{ height }"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  option: { type: Object, required: true },
  height: { type: String, default: '300px' }
})

const chartRef = ref(null)
let chart = null
let observer = null

function render() {
  if (!chartRef.value || !props.option) return
  if (!chart) chart = echarts.init(chartRef.value)
  chart.setOption(props.option, true)
}

function resize() {
  chart && chart.resize()
}

onMounted(() => {
  render()
  window.addEventListener('resize', resize)
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(resize)
    observer.observe(chartRef.value)
  }
})

watch(
  () => props.option,
  () => nextTick(render),
  { deep: true }
)

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  observer && observer.disconnect()
  chart && chart.dispose()
  chart = null
})

defineExpose({ resize, chart: () => chart })
</script>

<style scoped>
.echart-box {
  width: 100%;
}
</style>
