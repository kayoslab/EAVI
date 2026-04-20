export function createTrackDisplay(): { show(name: string): void; element: HTMLElement } {
  const el = document.createElement('div');
  el.style.cssText = `
    position: fixed;
    bottom: 2rem;
    left: 2rem;
    color: rgba(255, 255, 255, 0.6);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 0.85rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.8s ease-in-out;
    z-index: 5;
  `;
  document.body.appendChild(el);

  let fadeTimeout: ReturnType<typeof setTimeout> | null = null;

  return {
    element: el,
    show(name: string) {
      if (fadeTimeout) clearTimeout(fadeTimeout);
      el.textContent = name;
      el.style.opacity = '1';
      fadeTimeout = setTimeout(() => {
        el.style.opacity = '0';
      }, 4500); // visible for 4.5s, then 0.8s fade out
    },
  };
}
