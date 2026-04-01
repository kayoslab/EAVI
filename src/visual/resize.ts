export function attachResizeHandler(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, resolutionScale = 1.0): () => void {
  const onResize = () => {
    canvas.width = Math.floor(window.innerWidth * resolutionScale)
    canvas.height = Math.floor(window.innerHeight * resolutionScale)
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  window.addEventListener('resize', onResize)

  return () => {
    window.removeEventListener('resize', onResize)
  }
}
