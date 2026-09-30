import { characterBases, defaultCharacter, normalizeCharacter, palettes, type CharacterRecipe } from './character-spec';
import { generateMiao } from './generate-miao.mjs';
import { safeFileName } from './cat-vrm';
import { saveFile } from './desktop-io';
import { loadTraitPack, listTraits, type TraitPack } from './trait-pack';

const DRAFT_KEY = 'miao-character-draft-v1';
// 部件包约定位置：离线美术管线（Blender + vrm-addon-for-blender）产出后放这里；
// 不存在时静默回退到内置部件。
const TRAIT_PACK_URL = './assets/traits/manifest.json';
// Adding a base requires its definition, generator and validated VRM assets; UI/save code is shared.
const generators: Record<string, (recipe: CharacterRecipe) => Uint8Array<ArrayBuffer>> = {
  'miao-cat-v1': generateMiao,
  // trait-composer-v1（桩）：CharacterStudio 式 trait 网格合成尚未实现。
  // 真正实现前不要把 recipe.baseId 设成它；file() 会走到这里并给出明确错误。
  'trait-composer-v1': () => { throw new Error('trait 合成器尚未实现：请先用“喵小动猫咪”底座'); },
};
export function setupCharacterCreator(options: {
  preview: (file: File) => Promise<boolean>;
  save: (file: File, id?: string) => Promise<string>;
  currentRecipe: () => unknown;
  currentId: () => string;
  camera: () => void;
  frame: () => void;
  restore: (id: string) => Promise<unknown>;
  resumeOnboarding: (saved: boolean) => void;
}) {
  const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = element<HTMLDialogElement>('character-creator');
  const form = element<HTMLFieldSetElement>('creator-fields');
  const stageCard = document.querySelector('.stage-card')!;
  const stageHome = stageCard.parentElement!;
  const status = element('creator-status');
  const steps = [...document.querySelectorAll<HTMLElement>('[data-creator-step]')];
  const names = ['起个名字', '选底座与体型', '捏脸与五官', '头发、耳朵和尾巴', '穿上衣服', '搭配颜色', '开摄像头试动', '保存你的角色'];
  let recipe = structuredClone(defaultCharacter), step = 0, libraryId = '';
  let fromOnboarding = false, previousId = '';
  let revision = 0, rendered = -1, running: Promise<void> | null = null, timer = 0, busy = false;
  // 外链部件包（trait pack）：有则部件步骤用它（含缩略图），无则回退内置选项。
  let traitPack: TraitPack | null = null, traitPackTried = false;
  const ensureTraitPack = () => {
    if (traitPackTried) return;
    traitPackTried = true;
    loadTraitPack(TRAIT_PACK_URL).then(pack => {
      traitPack = pack;
      if (dialog.open) { updateBase(); sync(); status.textContent = `已加载部件包“${pack.label}”`; }
    }).catch(() => { /* 无部件包：用内置部件，不打扰用户 */ });
  };
  const file = () => {
    const generate = generators[recipe.baseId];
    if (!generate) throw new Error('此底座还不能生成，请保留草稿并更新程序');
    return new File([generate(recipe)], safeFileName(recipe.name), { type: 'model/vrm' });
  };
  const saveDraft = () => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ recipe, step, libraryId })); return true; }
    catch { status.textContent = '草稿未能保存，当前修改仍在；请导出 VRM 备份后再关闭。'; return false; }
  };
  const render = async () => {
    clearTimeout(timer);
    if (running) return running;
    running = (async () => {
      while (rendered !== revision && dialog.open) {
        const target = revision;
        status.textContent = '正在生成预览…';
        const loaded = await options.preview(file());
        if (!loaded) throw new Error('预览加载失败，请调整后重试');
        rendered = target;
      }
      options.frame();
      if (saveDraft()) status.textContent = '草稿已保存在本机 · 拖动右侧角色可旋转查看';
    })();
    try { await running; } finally { running = null; }
  };
  const preview = () => { revision++; clearTimeout(timer); timer = window.setTimeout(() => void render().catch(error => { status.textContent = String(error); }), 180); };
  // data-field 支持任意深度的点路径，如 face.nose.bridgeWidth。
  const getField = (path: string[]): unknown => path.reduce<unknown>((obj, key) => (obj as Record<string, unknown>)?.[key], recipe);
  const setField = (path: string[], value: unknown) => {
    const last = path[path.length - 1]!;
    const target = path.slice(0, -1).reduce<Record<string, unknown>>((obj, key) => obj[key] as Record<string, unknown>, recipe as unknown as Record<string, unknown>);
    target[last] = value;
  };
  const refreshThumbs = () => {
    for (const category of ['ears', 'tail', 'hair', 'clothes'] as const) {
      const strip = document.getElementById(`creator-${category}-thumbs`);
      if (!strip) continue;
      const current = recipe.parts[category];
      for (const img of strip.querySelectorAll('img')) img.classList.toggle('selected', img.dataset.traitId === current);
    }
  };
  const sync = () => {
    for (const input of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-field]')) {
      const value = getField(input.dataset.field!.split('.'));
      input.value = String(value);
      const output = input.nextElementSibling;
      if (input instanceof HTMLInputElement && input.type === 'range' && output instanceof HTMLOutputElement) output.value = `${Math.round(Number(value) * 100)}%`;
    }
    refreshThumbs();
    steps.forEach((panel, index) => { panel.hidden = step !== index; });
    element('creator-title').textContent = names[step]!;
    element('creator-progress').textContent = `第 ${step + 1} / ${steps.length} 步`;
    element<HTMLButtonElement>('creator-back').disabled = step === 0;
    element<HTMLButtonElement>('creator-next').hidden = step === steps.length - 1;
    element<HTMLButtonElement>('creator-random').hidden = step > 5;
  };
  const baseSelect = element<HTMLSelectElement>('creator-base');
  baseSelect.replaceChildren(...characterBases.map(base => new Option(base.label, base.id)));
  const updateBase = () => {
    const base = characterBases.find(base => base.id === recipe.baseId)!;
    for (const [category, choices] of Object.entries(base.parts)) {
      const select = element<HTMLSelectElement>('creator-' + category);
      const traits = listTraits(traitPack, category);
      const label = select.closest('label')!;
      let strip = document.getElementById(`creator-${category}-thumbs`);
      if (traits.length) {
        select.replaceChildren(...traits.map(trait => new Option(trait.name, trait.id)));
        if (!strip) {
          strip = document.createElement('div');
          strip.id = `creator-${category}-thumbs`;
          strip.className = 'trait-thumbs';
          label.append(strip);
        }
        strip.replaceChildren(...traits.map(trait => {
          const img = document.createElement('img');
          img.className = 'trait-thumb';
          img.dataset.traitId = trait.id;
          img.alt = trait.name; img.title = trait.name;
          if (trait.thumbnail) img.src = trait.thumbnail;
          else { img.removeAttribute('src'); img.textContent = trait.name; }
          img.addEventListener('click', () => {
            select.value = trait.id;
            select.dispatchEvent(new Event('input', { bubbles: true }));
          });
          return img;
        }));
      } else {
        select.replaceChildren(...Object.entries(choices).map(([id, name]) => new Option(name, id)));
        strip?.remove();
      }
      // 部件包里的选项 recipe 里可能没有：回退到第一个可用项。
      if (![...select.options].some(option => option.value === recipe.parts[category as keyof typeof recipe.parts])) {
        recipe.parts[category as keyof typeof recipe.parts] = select.options[0]?.value ?? '';
      }
      select.closest('label')!.hidden = !select.options.length;
    }
    element('creator-presets').replaceChildren(...base.presets.map(preset => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'soft-button'; button.textContent = preset.label;
      button.addEventListener('click', () => { recipe.proportions = { head: preset.head, width: preset.width }; sync(); saveDraft(); preview(); });
      return button;
    }));
  };
  form.addEventListener('input', event => {
    const input = event.target as HTMLInputElement;
    if (!input.dataset.field || busy) return;
    const path = input.dataset.field.split('.');
    const value = input.type === 'range' ? Number(input.value) : input.value;
    setField(path, path[0] === 'name' ? String(value) : value);
    if (path[0] === 'baseId') updateBase();
    // Do not reset the text cursor while typing a name (including an IME composition).
    if (path[0] !== 'name') sync();
    saveDraft(); preview();
  });
  element('creator-palettes').replaceChildren(...palettes.map(palette => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'soft-button'; button.textContent = palette.label;
    button.addEventListener('click', () => { recipe.colors = { fur: palette.fur, outfit: palette.outfit, accent: palette.accent, eyes: palette.eyes }; sync(); saveDraft(); preview(); });
    return button;
  }));
  element('creator-random').addEventListener('click', () => {
    const pick = <T>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]!;
    const jitter = (low: number, high: number) => low + Math.random() * (high - low);
    if (step === 0) recipe.name = pick(['奶茶', '布丁', '栗子', '团子', '云朵']) + '猫';
    if (step === 1) {
      recipe.proportions = { head: 0.85 + Math.random() * 0.35, width: 0.85 + Math.random() * 0.35 };
      recipe.body = { height: jitter(0.9, 1.2), shoulderWidth: jitter(0.85, 1.2), waistWidth: jitter(0.85, 1.2), hipWidth: jitter(0.85, 1.2) };
    }
    if (step === 2) recipe.face = {
      ...recipe.face,
      eyeShape: pick(['oval', 'round', 'gentle']), eyeSize: 0.8 + Math.random() * 0.4,
      brows: pick(['natural', 'short', 'bold']), mouth: pick(['natural', 'small', 'open']),
      nose: { bridgeWidth: jitter(0.85, 1.25), tip: jitter(0.85, 1.25), definition: jitter(0.85, 1.25) },
      cheeks: { fullness: jitter(0.85, 1.25) }, chin: { width: jitter(0.85, 1.25) },
      ears: { size: jitter(0.85, 1.25), point: Math.random() },
    };
    const base = characterBases.find(base => base.id === recipe.baseId)!;
    for (const category of (step === 3 ? ['ears', 'tail', 'hair'] : step === 4 ? ['clothes'] : []) as (keyof CharacterRecipe['parts'])[]) recipe.parts[category] = pick(Object.keys(base.parts[category]));
    if (step === 5) { const { label: _, ...colors } = pick(palettes); recipe.colors = colors; }
    sync(); saveDraft(); preview();
  });
  for (const [id, delta] of [['creator-back', -1], ['creator-next', 1]] as const) element(id).addEventListener('click', () => { step = Math.max(0, Math.min(steps.length - 1, step + delta)); sync(); saveDraft(); form.scrollTop = 0; });
  element('creator-camera').addEventListener('click', options.camera);
  const cameraStatus = document.getElementById('camera-status')!;
  const cameraObserver = new MutationObserver(() => { element('creator-camera-state').textContent = cameraStatus.textContent; });
  cameraObserver.observe(cameraStatus, { childList: true, characterData: true, subtree: true });
  element('creator-recenter').addEventListener('click', options.frame);
  new ResizeObserver(() => { if (dialog.open) options.frame(); }).observe(element('creator-preview'));
  const save = async (exportOnly: boolean, finish = false) => {
    if (busy) return;
    busy = true; form.disabled = true;
    for (const id of ['creator-save', 'creator-export', 'creator-close', 'creator-discard', 'creator-new', 'creator-random', 'creator-next', 'creator-back']) element<HTMLButtonElement>(id).disabled = true;
    try {
      await render();
      if (exportOnly) status.textContent = await saveFile(safeFileName(recipe.name), file()) ? 'VRM 已导出，可重新导入并继续编辑' : '已取消导出，草稿仍然保留';
      else { libraryId = await options.save(file(), libraryId || undefined); if (saveDraft()) status.textContent = '已保存到角色库；下次可继续编辑，也可以导出 VRM'; }
      if (finish) dialog.close('saved');
    } catch (error) { status.textContent = `保存未完成：${error instanceof Error ? error.message : '请检查本机空间和文件夹权限后重试'}`; }
    finally { busy = false; form.disabled = false; for (const id of ['creator-save', 'creator-export', 'creator-close', 'creator-discard', 'creator-new', 'creator-random', 'creator-next', 'creator-back']) element<HTMLButtonElement>(id).disabled = false; sync(); }
  };
  element('creator-save').addEventListener('click', () => void save(false));
  element('creator-export').addEventListener('click', () => void save(true));
  element('creator-close').addEventListener('click', () => void save(false, true));
  element('creator-discard').addEventListener('click', async () => {
    if (busy) return;
    busy = true; clearTimeout(timer); form.disabled = true;
    try { await running; await options.restore(libraryId || previousId); dialog.close('discarded'); }
    catch { status.textContent = '返回失败，草稿仍在，请重试'; }
    finally { busy = false; form.disabled = false; }
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); void save(false, true); });
  dialog.addEventListener('close', () => {
    clearTimeout(timer); stageHome.append(stageCard); document.body.classList.remove('creating-character'); options.frame();
    if (fromOnboarding) { fromOnboarding = false; options.resumeOnboarding(dialog.returnValue === 'saved'); }
  });
  const open = (fresh: boolean, fromCurrent = false) => {
    try {
      if (!dialog.open) {
        fromOnboarding = (document.getElementById('onboarding-dialog') as HTMLDialogElement).open;
        previousId = options.currentId();
      }
      if (fresh) { recipe = structuredClone(defaultCharacter); step = 0; libraryId = ''; }
      else if (fromCurrent) { recipe = normalizeCharacter(options.currentRecipe()); step = 0; libraryId = options.currentId(); }
      else {
        const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
        recipe = normalizeCharacter(draft?.recipe ?? defaultCharacter);
        step = Number.isInteger(draft?.step) ? Math.max(0, Math.min(7, draft.step)) : 0;
        libraryId = typeof draft?.libraryId === 'string' ? draft.libraryId : '';
      }
      (document.getElementById('onboarding-dialog') as HTMLDialogElement).close();
      ensureTraitPack();
      updateBase(); sync();
      element('creator-preview').append(stageCard);
      document.body.classList.add('creating-character');
      if (!dialog.open) dialog.showModal();
      rendered = -1; preview();
      element('creator-camera-state').textContent = cameraStatus.textContent;
    } catch (error) { element('toast').textContent = String(error); element('toast').hidden = false; }
  };
  element('create-character').addEventListener('click', () => open(false));
  element('onboarding-create').addEventListener('click', () => open(false));
  element('creator-new').addEventListener('click', () => open(true));
  element('edit-created-character').addEventListener('click', () => open(false, true));
}
