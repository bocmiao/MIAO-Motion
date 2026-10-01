import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTraitPack, listTraits, traitCategories } from '../src/trait-pack.ts';

test('宽松解析 trait pack manifest：跳过坏条目，空包抛错', () => {
  const pack = parseTraitPack({
    id: 'demo', label: '演示包', version: 2,
    traits: [
      { id: 'hair', label: '发型', collection: [
        { id: 'twin-tails', name: '双马尾', modelUrl: './hair/twin.vrm', thumbnail: './hair/twin.png' },
        { id: 'broken' }, // 缺 modelUrl：跳过
      ], cullingLayer: ['scalp'], cameraTarget: 'head' },
      { id: 'empty', collection: [] }, // 无部件：跳过
    ],
  });
  assert.equal(pack.version, 2);
  assert.deepEqual(traitCategories(pack), [{ id: 'hair', label: '发型' }]);
  assert.deepEqual(listTraits(pack, 'hair').map(t => t.id), ['twin-tails']);
  assert.equal(listTraits(pack, 'ears').length, 0); // 未知分类：空数组，调用方回退内置
  assert.equal(listTraits(null, 'hair').length, 0); // 无部件包：空数组
  assert.throws(() => parseTraitPack({ traits: [] }), /没有可用部件/);
  assert.throws(() => parseTraitPack(null), /JSON 对象/);
});
