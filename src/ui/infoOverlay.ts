let overlay: HTMLDivElement | null = null;

function showOverlay(): void {
  if (overlay) overlay.style.display = 'flex';
}

function hideOverlay(): void {
  if (overlay) overlay.style.display = 'none';
}

export function createInfoButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'eavi-info-btn';
  btn.setAttribute('aria-label', 'About this work');
  btn.textContent = 'ⓘ';
  btn.addEventListener('click', showOverlay);
  return btn;
}

export function createInfoOverlay(): HTMLDivElement {
  overlay = document.createElement('div');
  overlay.className = 'eavi-info-overlay';
  overlay.style.display = 'none';

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hideOverlay();
  });

  const panel = document.createElement('div');
  panel.className = 'eavi-info-panel';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'eavi-info-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', hideOverlay);

  const content = document.createElement('p');
  content.textContent =
    'EAVI is an ephemeral generative audiovisual experience. Each visit creates a unique, non-repeatable scene.';

  panel.appendChild(closeBtn);
  panel.appendChild(content);
  overlay.appendChild(panel);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideOverlay();
  });

  return overlay;
}
