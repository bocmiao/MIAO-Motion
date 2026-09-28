import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { putStoredModel, listStoredModels, updateStoredModel, deleteStoredModel, putStoredProfile, listStoredProfiles, deleteStoredProfile } from '../src/storage.mjs';

test('concurrent identical imports deduplicate transactionally, retain thumbnail/name and preserve distinct files', async () => {
  const file = new File(['test'], 'private.vrm', { lastModified: 42 });
  const [a, b] = await Promise.all([putStoredModel(file), putStoredModel(file)]);
  assert.equal(a.id, b.id);
  await updateStoredModel(a.id, { name: 'renamed.vrm', thumbnail: 'data:image/webp;base64,test' });
  const again = await putStoredModel(file);
  assert.equal(again.name, 'renamed.vrm'); assert.ok(again.thumbnail);
  const different = await putStoredModel(new File(['different'], 'private.vrm', { lastModified: 43 }));
  assert.notEqual(different.id, a.id);
  assert.equal((await listStoredModels()).length, 2);
  await deleteStoredModel(a.id); await deleteStoredModel(different.id);
  assert.equal((await listStoredModels()).length, 0);
});

test('profile overwrite is atomic and deletion leaves no stale record', async () => {
  await putStoredProfile({ id: 'profile', name: 'first', modelId: '', settings: {}, updatedAt: 1 });
  await putStoredProfile({ id: 'profile', name: 'second', modelId: '', settings: {}, updatedAt: 2 });
  assert.equal((await listStoredProfiles())[0].name, 'second');
  assert.equal((await listStoredProfiles()).length, 1);
  await deleteStoredProfile('profile'); assert.equal((await listStoredProfiles()).length, 0);
});

test('updating a removed model rejects once, with no orphaned transaction rejection', async () => {
  await assert.rejects(updateStoredModel('missing', { name: 'renamed.vrm' }), /找不到模型记录/);
  // Node's test runner also fails this test on any later unhandled rejection.
  const saved = await putStoredModel(new File(['after abort'], 'recover.vrm'));
  await deleteStoredModel(saved.id);
});
