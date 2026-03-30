import './style.css'
import { initScene } from './visual/scene'
import { attachResizeHandler } from './visual/resize'
import { startLoop } from './visual/renderLoop'

const container = document.querySelector<HTMLDivElement>('#app')!
const { canvas, ctx } = initScene(container)
attachResizeHandler(canvas, ctx)
startLoop(canvas, ctx)
