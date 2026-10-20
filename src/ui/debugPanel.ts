import type { PostStack } from '../post/stack';
import { NUMERIC_PARAM_KEYS, PARAM_RANGES, type NumericParamKey } from '../post/params';
import { PRESETS, PRESET_NAMES, type PresetName } from '../post/presets';

/** `?debug` tweak panel: preset selector, limiter bypass, one slider per post parameter. */
export function createDebugPanel(post: PostStack): { element: HTMLElement; refresh(): void } {
  const root = document.createElement('div');
  root.className = 'eavi-debug-panel';

  const header = document.createElement('div');
  header.className = 'eavi-debug-panel-header';
  header.textContent = 'post';
  root.appendChild(header);

  const presetRow = document.createElement('label');
  presetRow.textContent = 'preset ';
  const select = document.createElement('select');
  for (const name of PRESET_NAMES) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  }
  select.value = post.presetName;
  select.addEventListener('change', () => {
    post.setPreset(PRESETS[select.value as PresetName]);
    refresh();
  });
  presetRow.appendChild(select);
  root.appendChild(presetRow);

  const limiterRow = document.createElement('label');
  const limiter = document.createElement('input');
  limiter.type = 'checkbox';
  limiter.checked = true;
  limiter.addEventListener('change', () => post.setLimiterEnabled(limiter.checked));
  limiterRow.append(limiter, document.createTextNode(' luminance limiter'));
  root.appendChild(limiterRow);

  const inputs = new Map<NumericParamKey, { range: HTMLInputElement; value: HTMLSpanElement }>();
  for (const key of NUMERIC_PARAM_KEYS) {
    const [min, max, step] = PARAM_RANGES[key];
    const row = document.createElement('label');
    row.className = 'eavi-debug-panel-row';
    const name = document.createElement('span');
    name.textContent = key;
    const range = document.createElement('input');
    range.type = 'range';
    range.min = String(min);
    range.max = String(max);
    range.step = String(step);
    range.value = String(post.params[key]);
    const value = document.createElement('span');
    value.className = 'eavi-debug-panel-value';
    value.textContent = format(post.params[key]);
    range.addEventListener('input', () => {
      const v = Number(range.value);
      post.setParams({ [key]: v } as Partial<Record<NumericParamKey, number>>);
      value.textContent = format(v);
    });
    row.append(name, range, value);
    root.appendChild(row);
    inputs.set(key, { range, value });
  }

  function refresh(): void {
    select.value = post.presetName;
    for (const [key, { range, value }] of inputs) {
      range.value = String(post.params[key]);
      value.textContent = format(post.params[key]);
    }
  }

  return { element: root, refresh };
}

function format(v: number): string {
  return Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}
