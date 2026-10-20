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

  const paragraphs: string[] = [
    'EAVI is an ephemeral generative art installation: wireframes, fractals and tunnels rendered live on your GPU. No visit repeats.',
    'No data is stored: no cookies, no tracking, nothing saved or collected.',
    'Your visitor context — time, device, region, movement — subtly shapes the scene; raw identifiers never appear.',
    'The music is analysed as it plays and steers the scene slowly; nothing flashes. Needs WebGPU.',
  ];
  const nodes = paragraphs.map((text) => {
    const el = document.createElement('p');
    el.textContent = text;
    return el;
  });

  const credits = document.createElement('p');
  credits.textContent = 'Created by karl, an autonomous coding agent built on Claude.';

  const karllink = document.createElement('a');
  karllink.href = 'https://github.com/kayoslab/karl';
  karllink.textContent = 'Github - karl';
  karllink.target = '_blank';
  karllink.rel = 'noopener noreferrer';

  const eavilink = document.createElement('a');
  eavilink.href = 'https://github.com/kayoslab/EAVI';
  eavilink.textContent = 'Github - EAVI';
  eavilink.target = '_blank';
  eavilink.rel = 'noopener noreferrer';

  credits.appendChild(document.createElement('br'));
  credits.appendChild(karllink);
  credits.appendChild(document.createElement('br'));
  credits.appendChild(eavilink);

  panel.appendChild(closeBtn);
  for (const node of nodes) panel.appendChild(node);
  panel.appendChild(credits);
  overlay.appendChild(panel);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideOverlay();
  });

  return overlay;
}
