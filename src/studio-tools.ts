import { Color, Material, Mesh, WebGLRenderer } from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { installedTag, latestRelease, isNewer } from '../public/release-info.js';
import { version } from '../package.json';
import { createAutoQuality } from './auto-quality.mjs';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const expressions = ['happy', 'angry', 'sad', 'relaxed', 'surprised'];

export function setupStudioTools(renderer: WebGLRenderer, avatar: () => VRM | null, modelId: () => string, notify: (text: string) => void, inputChanged: () => void) {
  const materialSelect = element<HTMLSelectElement>('avatar-material');
  const colorInput = element<HTMLInputElement>('avatar-color');
  const expressionSelect = element<HTMLSelectElement>('expression-preset');
  const micButton = element<HTMLButtonElement>('microphone-toggle');
  const micStatus = element('microphone-status');
  let materials: (Material & { color: Color })[] = [];
  let originals: Color[] = [];
  let overrides: Record<string, string> = {};
  let selectedExpression = '';
  let mic: MediaStream | null = null;
  let audio: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let samples = new Float32Array(1024);
  let micGeneration = 0;

  const key = () => `miao-appearance-${modelId()}`;
  const saveColors = () => {
    if (!modelId()) return;
    try { localStorage.setItem(key(), JSON.stringify(overrides)); }
    catch { notify('当前换色已应用，但空间不足，未能保存'); }
  };
  const selectColor = () => {
    const material = materials[Number(materialSelect.value)];
    colorInput.disabled = !material;
    if (material) colorInput.value = `#${material.color.getHexString()}`;
  };
  materialSelect.addEventListener('change', selectColor);
  colorInput.addEventListener('input', () => {
    const index = Number(materialSelect.value), material = materials[index];
    if (!material) return;
    material.color.set(colorInput.value);
    overrides[String(index)] = colorInput.value;
    saveColors();
  });
  element('avatar-color-reset').addEventListener('click', () => {
    materials.forEach((material, index) => { if (originals[index]) material.color.copy(originals[index]); });
    overrides = {}; saveColors(); selectColor();
  });
  const chooseExpression = (name: string) => {
    if (name && !avatar()?.expressionManager?.getExpression(name)) { notify('这个角色没有对应表情'); return; }
    selectedExpression = name;
    expressionSelect.value = name;
  };
  expressionSelect.addEventListener('change', () => chooseExpression(expressionSelect.value));
  window.addEventListener('keydown', event => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || document.querySelector('dialog[open]')) return;
    if ((event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (/^[0-5]$/.test(event.key)) chooseExpression(expressions[Number(event.key) - 1] ?? '');
  });

  const stopMicrophone = () => {
    micGeneration++;
    mic?.getTracks().forEach(track => track.stop()); mic = null;
    void audio?.close(); audio = null; analyser = null;
    micButton.textContent = '开启语音嘴型'; micButton.disabled = false;
    micStatus.textContent = '麦克风未开启';
    inputChanged();
  };
  micButton.addEventListener('click', async () => {
    if (mic) { stopMicrophone(); return; }
    const generation = ++micGeneration;
    micButton.disabled = true;
    micStatus.textContent = '等待麦克风权限…';
    let pending: MediaStream | null = null;
    try {
      pending = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (generation !== micGeneration) { pending.getTracks().forEach(t => t.stop()); return; }
      mic = pending;
      audio = new AudioContext();
      analyser = audio.createAnalyser(); analyser.fftSize = 1024;
      samples = new Float32Array(analyser.fftSize);
      audio.createMediaStreamSource(mic).connect(analyser);
      await audio.resume();
      if (generation !== micGeneration) return;
      mic.getAudioTracks().forEach(t => t.addEventListener('ended', stopMicrophone));
      micButton.textContent = '关闭语音嘴型';
      micStatus.textContent = '语音嘴型已开启 · 不播放、不录音、不上传';
      inputChanged();
    } catch {
      pending?.getTracks().forEach(t => t.stop());
      if (generation !== micGeneration) return;
      stopMicrophone(); micStatus.textContent = '无法开启麦克风，请检查权限或设备占用';
    } finally { if (generation === micGeneration) micButton.disabled = false; }
  });
  window.addEventListener('pagehide', stopMicrophone);

  const updateButton = element<HTMLButtonElement>('check-update');
  updateButton.addEventListener('click', async () => {
    updateButton.disabled = true;
    const status = element('update-status');
    status.textContent = '正在查询 GitHub 发布记录…';
    try {
      const release = await latestRelease();
      status.textContent = isNewer(release.tag, installedTag(version)) ? `发现新版本 ${release.tag}，请打开下载页更新。` : `当前版本 v${version} 已是最新可用版本。`;
    } catch { status.textContent = '暂时无法检查更新，请稍后重试或打开官方下载列表。'; }
    finally { updateButton.disabled = false; }
  });

  const autoQuality = createAutoQuality();
  return {
    microphoneActive: () => Boolean(mic),
    reloadAppearance() {
      const found = new Set<Material & { color: Color }>();
      avatar()?.scene.traverse(object => {
        if (!(object instanceof Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if ('color' in material && material.color instanceof Color) found.add(material as Material & { color: Color });
        }
      });
      materials = [...found]; originals = materials.map(m => m.color.clone()); overrides = {};
      try {
        const stored: unknown = JSON.parse(localStorage.getItem(key()) ?? '{}');
        if (stored && typeof stored === 'object') for (const [index, color] of Object.entries(stored)) {
          if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) && materials[Number(index)]) {
            materials[Number(index)]!.color.set(color); overrides[index] = color;
          }
        }
      } catch { /* A damaged preference must not prevent loading a character. */ }
      materialSelect.replaceChildren(...materials.map((m, i) => new Option(m.name || `材质 ${i + 1}`, String(i))));
      materialSelect.disabled = !materials.length; selectColor();
      expressionSelect.replaceChildren(new Option('自然 · 0', ''), ...expressions.map((name, i) => {
        const option = new Option(`${['开心', '生气', '难过', '放松', '惊讶'][i]} · ${i + 1}`, name);
        option.disabled = !avatar()?.expressionManager?.getExpression(name); return option;
      }));
      selectedExpression = ''; expressionSelect.value = '';
    },
    apply() {
      const manager = avatar()?.expressionManager;
      if (!manager) return;
      for (const name of expressions) {
        if (name !== 'happy' || selectedExpression) manager.setValue(name, name === selectedExpression ? 1 : 0);
      }
      if (analyser) {
        analyser.getFloatTimeDomainData(samples);
        let energy = 0; for (const sample of samples) energy += sample * sample;
        const gain = Number(element<HTMLInputElement>('microphone-gain').value);
        manager.setValue('aa', Math.min(1, Math.max(0, (Math.sqrt(energy / samples.length) - 0.015) * gain)));
        manager.setValue('oh', 0);
      }
    },
    quality(now: number, auto: boolean, trackingBusy = false) {
      if (!auto || document.hidden) { autoQuality.reset(now); return; }
      const report = autoQuality.frame(now, trackingBusy);
      if (!report) return;
      const target = Math.min(window.devicePixelRatio, report.ratio);
      if (renderer.getPixelRatio() !== target) renderer.setPixelRatio(target);
      element('auto-quality-status').textContent = `自动画质 · ${Math.round(report.fps)} 帧/秒 · 渲染倍率 ${target.toFixed(2)}${report.bodyTracking ? ' · 身体追踪中，持续明显卡顿才降低清晰度' : ''}`;
    },
  };
}
