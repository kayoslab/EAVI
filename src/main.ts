import './style.css'
import { initScene } from './visual/scene'
import { attachResizeHandler } from './visual/resize'
import { startLoop } from './visual/renderLoop'
import { createInfoButton, createInfoOverlay } from './ui/infoOverlay'
import { initPointer } from './input/pointer'

const container = document.querySelector<HTMLDivElement>('#app')!
const { canvas, ctx } = initScene(container)
attachResizeHandler(canvas, ctx)
initPointer(canvas)
startLoop(canvas, ctx)

container.appendChild(createInfoButton())
container.appendChild(createInfoOverlay())
