// Use an existing Playwright installation, without changing the game's dependencies:
// PLAYWRIGHT_MODULE=file:///path/to/playwright/index.mjs node src/fx/smoke.mjs
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  await page.goto(`${process.env.FX_URL || 'http://localhost:5187/demos/fx.html'}?intro=0&model=beaver`);
  await page.waitForFunction(() => window.__fxDemo && document.querySelector('#model-status').textContent.startsWith('GLB loaded'));
  await page.screenshot({ path: '/tmp/scotty-fx-overview.png' });
  for (const name of ['slash', 'dash', 'finalCut', 'arc', 'burst', 'hit', 'kill', 'slam', 'debris', 'hurt', 'combo', 'numbers', 'flash', 'splitBox', 'splitSphere', 'splitModel', 'finisher', 'victory', 'slow', 'letterbox', 'reset']) {
    await page.locator(`[data-action="${name}"]`).click();
    await page.waitForTimeout(65);
  }
  await page.locator('[data-action="impact"]').click();
  await page.waitForTimeout(650);
  await page.evaluate(() => {
    // Advance real-time flash deterministically even on a slow software WebGL renderer.
    const { fx, renderer } = window.__fxDemo;
    for (let i = 0; i < 10; i++) fx.update({ time: i * 0.025, dt: 0.025, realDt: 0.1, timeScale: 0.25 });
    renderer.info.reset(); fx.render();
  });
  await page.screenshot({ path: '/tmp/scotty-fx-final-cut.png' });
  const diagnostics = await page.evaluate(() => {
    const { fx, actions, scene, camera, renderer } = window.__fxDemo;
    const check = (value, message) => { if (!value) throw new Error(message); };
    actions.reset(); renderer.setAnimationLoop(null);
    const point = camera.position.clone().set(0, 1, 0);
    const normal = point.clone().set(1, 0.2, 0).normalize();
    const model = scene.getObjectByName('demo:loaded-model');
    model.visible = true;
    let triangles = 0;
    model.traverse(o => { if (o.isMesh) triangles += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; });
    check(triangles > 1000, 'Expected the generated beaver GLB, not the fixture');
    const sceneCount = scene.children.length;
    let sourceDisposals = 0;
    model.traverse(o => {
      if (o.isMesh) {
        o.geometry.addEventListener('dispose', () => sourceDisposals++);
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach(m => m.addEventListener('dispose', () => sourceDisposals++));
      }
    });
    fx.splitObject(model, normal, 4);
    scene.updateMatrixWorld(true);
    const halves = scene.children.filter(o => o.name === 'fx:split-half' && o.visible);
    check(halves.length === 2, 'Split did not create two halves');
    check(halves[0].children[0].matrixWorld.elements.every((v, i) => Math.abs(v - model.matrixWorld.elements[i]) < 0.00001), 'Split lost the nested world transform');
    const splitMaterials = [];
    halves.forEach(h => h.traverse(o => {
      if (o.isMesh) {
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach(m => { check(m.clippingPlanes.length === 1, 'Missing clipping plane'); splitMaterials.push(m); });
      }
    }));
    let splitDisposals = 0;
    splitMaterials.forEach(m => m.addEventListener('dispose', () => splitDisposals++));
    for (let i = 0; i < 48; i++) fx.update({ time: i * 0.1, dt: 0.1, realDt: 0.016, timeScale: 1 });
    check(!halves[0].visible && halves[0].children.length === 0, 'Expired split did not clear');
    check(splitDisposals === splitMaterials.length, 'Split materials leaked');
    check(sourceDisposals === 0, 'Split disposed original resources');
    fx.petalBurst(point, 30, 1);
    fx.damageNumber(point, 3, 'combo');
    fx.update({ time: 0, dt: 0, realDt: 0, timeScale: 0 });
    const petals = scene.getObjectByName('fx:petals');
    const positions = petals.geometry.attributes.aPosition;
    const before = Array.from(positions.array);
    for (let i = 0; i < 12; i++) fx.update({ time: 0, dt: 0, realDt: 0.1, timeScale: 0 });
    check(before.every((v, i) => v === positions.array[i]), 'Petals moved during hit-stop');
    check(scene.getObjectByName('fx:damage-text').geometry.drawRange.count === 0, 'Damage text did not use real time');
    const old = fx.beginTrail('dash'); fx.reset();
    const fresh = fx.beginTrail('dash'); fresh.push(point, normal); fresh.push(normal, point); fresh.end();
    old.push(point, normal); old.end();
    fx.update({ time: 1, dt: 0.01, realDt: 0.01, timeScale: 1 });
    check(scene.children.filter(o => o.name === 'fx:sword-ribbon' && o.visible).length === 1, 'Stale trail handle changed a recycled slot');
    for (let i = 0; i < 450; i++) fx.update({ time: i * 0.04, dt: 0.04, realDt: 0.04, timeScale: 1 });
    check(petals.count === 550, 'Sustained low FPS did not lower the particle budget');
    fx.reset(); renderer.info.reset(); fx.render();
    check(scene.children.length === sceneCount, 'Effect triggers added unbounded scene objects');
    check(renderer.localClippingEnabled, 'Local clipping disabled');
    return { triangles, splitMaterials: splitMaterials.length, particleLimit: petals.count, draws: renderer.info.render.calls, geometries: renderer.info.memory.geometries };
  });
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  mobile.on('pageerror', e => errors.push(e.message));
  mobile.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  await mobile.goto(`${process.env.FX_URL || 'http://localhost:5187/demos/fx.html'}?intro=0`);
  await mobile.waitForFunction(() => window.__fxDemo);
  assert.equal(await mobile.evaluate(() => window.__fxDemo.scene.getObjectByName('fx:petals').count), 900);
  await mobile.locator('[data-action="dash"]').click();
  await mobile.waitForTimeout(220);
  await mobile.screenshot({ path: '/tmp/scotty-fx-mobile.png' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, diagnostics, consoleErrors: errors, screenshots: ['/tmp/scotty-fx-overview.png', '/tmp/scotty-fx-final-cut.png', '/tmp/scotty-fx-mobile.png'] }, null, 2));
} finally {
  await browser.close();
}
