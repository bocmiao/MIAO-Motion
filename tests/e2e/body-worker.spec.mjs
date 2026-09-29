import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
test('real offline worker detects official pose and hand images without blocking UI', async ({ page }) => {
  test.setTimeout(120_000);
  for (const name of ['pose.jpg','right_hands.jpg']) {
    const body = await readFile(new URL('../fixtures/mediapipe/'+name,import.meta.url));
    await page.route('**/test/'+name, r=>r.fulfill({body,contentType:'image/jpeg'}));
  }
  await page.goto('/');
  const results = await page.evaluate(async () => {
    const worker = new Worker('/body-worker.js');
    let ticks = 0; const clock = setInterval(()=>ticks++, 10);
    const ask = (message, transfer=[]) => new Promise((resolve,reject) => {
      const timeout = setTimeout(()=>reject(Error('Worker timed out')),60000);
      worker.onerror = e=>{clearTimeout(timeout);reject(Error(e.message));};
      worker.onmessage = ({data})=>{clearTimeout(timeout);data.type==='error'?reject(Error(data.message)):resolve(data);};
      worker.postMessage(message,transfer);
    });
    try {
      const ready = await ask({type:'init'});
      const output = {};
      for (const name of ['pose.jpg','right_hands.jpg']) {
        const frame = await createImageBitmap(await (await fetch('/test/'+name)).blob());
        const before = ticks, start = performance.now();
        const result = await ask({type:'frame',frame,now:start},[frame]);
        output[name] = { result, ticks: ticks-before, duration: performance.now()-start };
      }
      return { ready, output };
    } finally {clearInterval(clock);worker.terminate();}
  });
  expect(results.ready.type).toBe('ready');
  expect(results.output['pose.jpg'].result.pose).toHaveLength(33);
  expect(results.output['right_hands.jpg'].result.hands).toHaveLength(2);
  for (const item of Object.values(results.output)) {
    // A completed inference must let independent main-thread timers run.
    expect(item.ticks).toBeGreaterThan(1);
    expect(item.result.elapsed).toBeGreaterThan(0);
  }
  for (const hand of results.output['right_hands.jpg'].result.hands) {
    expect(hand).toHaveLength(21);
    expect(hand.every(p=>[p.x,p.y,p.z].every(Number.isFinite))).toBe(true);
    expect(hand.every(p=>p.visibility===0)).toBe(true);
  }
  if (process.env.MIAO_RECORD_LANDMARKS) await writeFile(new URL('../fixtures/mediapipe/observed-results.json',import.meta.url),JSON.stringify(results.output,null,2)+'\n');
});
