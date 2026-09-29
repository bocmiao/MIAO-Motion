import { saveFile } from './desktop-io';
import { partOptions } from './character-spec';
import { Color, Mesh } from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { catChoices, readCat, exportCat, safeFileName, type CatCategory, type CatStyle } from './cat-vrm';

export function setupCatEditor(avatar: () => VRM | null, modelId: () => string) {
  const fieldset = document.getElementById('cat-editor') as HTMLFieldSetElement;
  const status = document.getElementById('cat-editor-status')!;
  const name = document.getElementById('cat-name') as HTMLInputElement;
  const categories = Object.keys(catChoices) as CatCategory[];
  const selects = Object.fromEntries(categories.map(c => [c, document.getElementById(`cat-${c}`)])) as Record<CatCategory, HTMLSelectElement>;
  let source: ArrayBuffer | null = null;
  const key = () => `miao-cat-${modelId()}`;
  const style = (): CatStyle => ({ name: name.value.trim() || '喵小动', ears: selects.ears.value, tail: selects.tail.value, hair: selects.hair.value, clothes: selects.clothes.value });
  const apply = () => {
    for (const category of categories) for (const choice of catChoices[category]) {
      avatar()?.scene.getObjectByName(`miao_part_${category}_${choice}`)?.scale.setScalar(choice === selects[category].value ? 1 : 0);
    }
    document.getElementById('model-name')!.textContent = style().name;
  };
  fieldset.addEventListener('input', () => {
    if (!source) return;
    apply();
    try { if (modelId()) localStorage.setItem(key(), JSON.stringify(style())); status.textContent = '修改已应用；导出 VRM 后可重新导入或备份。'; }
    catch { status.textContent = '当前修改已应用，但未能保存在本机，请导出备份。'; }
  });
  const editedFile = () => {
    if (!source) throw new Error('尚未加载角色');
    const colors: Record<string, number[]> = {};
    avatar()?.scene.traverse(object => {
      if (!(object instanceof Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if ('color' in material && material.color instanceof Color) colors[material.name] = material.color.toArray();
      }
    });
    return exportCat(source, style(), colors);
  };
  document.getElementById('cat-export')!.addEventListener('click', async () => {
    if (!source) return;
    try {
      const output = editedFile();
      const fileName = safeFileName(style().name);
      status.textContent = '正在准备保存文件…';
      if (!await saveFile(fileName, new Blob([output], { type: 'model/vrm' }))) { status.textContent = '已取消保存'; return; }
      status.textContent = `已导出“${fileName}”，保留了骨骼和表情。作者仍为喵动项目（原角色许可：VRM 公共许可，允许任何人使用、商用与修改再分发），名字改为你起的名字。`;
    } catch { status.textContent = '导出失败，请检查目标文件夹权限和剩余空间后重试。'; }
  });
  return { recipe() { return source ? readCat(editedFile().buffer).document.extras?.miaoCharacter ?? null : null; }, async load(file: File, expected: VRM) {
    source = null; fieldset.disabled = true;
    try {
      const buffer = await file.arrayBuffer();
      if (avatar() !== expected) return;
      const initial = readCat(buffer).style;
      let saved: Partial<CatStyle> = {};
      try { saved = JSON.parse(localStorage.getItem(key()) ?? '{}') ?? {}; } catch { /* Use the model's own defaults. */ }
      name.value = typeof saved.name === 'string' ? saved.name.slice(0,40) : initial.name;
      for (const category of categories) {
        const value = saved[category];
        const selected = typeof value === 'string' && expected.scene.getObjectByName('miao_part_'+category+'_'+value) ? value : initial[category];
        selects[category].replaceChildren(...catChoices[category].filter(choice => expected.scene.getObjectByName('miao_part_'+category+'_'+choice)).map(choice => new Option((partOptions[category] as Record<string, string>)[choice], choice)));
        selects[category].value = selected;
      }
      source = buffer; fieldset.disabled = false; apply();
      status.textContent = '可换耳朵、尾巴、发型和衣服，起名后导出自己的 VRM。';
    } catch {
      if (avatar() === expected) status.textContent = '仅新版喵小动支持部件与导出。可从首页“用喵小动”加载。';
    }
  }, clear() { source = null; fieldset.disabled = true; } };
}
