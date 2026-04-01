export function initScene(container: HTMLElement, resolutionScale = 1.0): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.style.display = 'block'
  canvas.width = Math.floor(window.innerWidth * resolutionScale)
  canvas.height = Math.floor(window.innerHeight * resolutionScale)
  container.appendChild(canvas)

  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  return { canvas, ctx }
}
