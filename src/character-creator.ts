import { characterBases, defaultCharacter, normalizeCharacter, palettes, type CharacterRecipe } from './character-spec';
import { generateMiao } from './generate-miao.mjs';
import { safeFileName } from './cat-vrm';
import { saveFile } from './desktop-io';

const DRAFT_KEY = 'miao-character-draft-v1';
// Adding a base requires its definition, generator and validated VRM assets; UI/save code is shared.
const generators: Record<string, (recipe: CharacterRecipe) => Uint8Array<ArrayBuffer>> = { 'miao-cat-v1': generateMiao };
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
  const names = ['起个名字', '选底座与比例', '捏脸', '头发、耳朵和尾巴', '穿上衣服', '搭配颜色', '开摄像头试动', '保存你的角色'];
  let recipe = structuredClone(defaultCharacter), step = 0, libraryId = '';
  let fromOnboarding = false, previousId = '';
  let revision = 0, rendered = -1, running: Promise<void> | null = null, timer = 0, busy = false;
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
  const sync = () => {
    for (const input of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-field]')) {
      const [section, key] = input.dataset.field!.split('.');
      const value = key ? (recipe[section as keyof CharacterRecipe] as Record<string, unknown>)[key] : recipe[section as keyof CharacterRecipe];
      input.value = String(value);
      const output = input.nextElementSibling;
      if (input instanceof HTMLInputElement && input.type === 'range' && output instanceof HTMLOutputElement) output.value = `${Math.round(Number(value) * 100)}%`;
    }
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
      select.replaceChildren(...Object.entries(choices).map(([id, name]) => new Option(name, id)));
      select.closest('label')!.hidden = !Object.keys(choices).length;
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
    const [section, key] = input.dataset.field.split('.');
    const value = input.type === 'range' ? Number(input.value) : input.value;
    if (key) (recipe[section as keyof CharacterRecipe] as Record<string, unknown>)[key] = value;
    else if (section === 'name') recipe.name = String(value);
    else if (section === 'baseId') { recipe.baseId = String(value); updateBase(); }
    // Do not reset the text cursor while typing a name (including an IME composition).
    if (section !== 'name') sync();
    saveDraft(); preview();
  });
  element('creator-palettes').replaceChildren(...palettes.map(palette => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'soft-button'; button.textContent = palette.label;
    button.addEventListener('click', () => { recipe.colors = { fur: palette.fur, outfit: palette.outfit, accent: palette.accent, eyes: palette.eyes }; sync(); saveDraft(); preview(); });
    return button;
  }));
  element('creator-random').addEventListener('click', () => {
    const pick = <T>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]!;
    if (step === 0) recipe.name = pick(['奶茶', '布丁', '栗子', '团子', '云朵']) + '猫';
    if (step === 1) { recipe.proportions = { head: 0.85 + Math.random() * 0.35, width: 0.85 + Math.random() * 0.35 }; }
    if (step === 2) recipe.face = { eyeShape: pick(['oval', 'round', 'gentle']), eyeSize: 0.8 + Math.random() * 0.4, brows: pick(['natural', 'short', 'bold']), mouth: pick(['natural', 'small', 'open']) };
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
