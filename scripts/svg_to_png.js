// Рендерит docs/architecture.svg и docs/diagrams/*.svg в PNG (Chromium из Playwright).
// Запуск: node scripts/svg_to_png.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const docs = path.resolve(__dirname, '..', 'docs');
const dir = path.join(docs, 'diagrams');
const jobs = [[path.join(docs, 'architecture.svg'), path.join(dir, 'architecture.png')]];
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
  jobs.push([path.join(dir, f), path.join(dir, f.replace(/\.svg$/, '.png'))]);
}

(async () => {
  const browser = await chromium.launch();
  for (const [src, dst] of jobs) {
    const m = fs.readFileSync(src, 'utf8').match(/<svg[^>]*\swidth="(\d+)"[^>]*\sheight="(\d+)"/);
    const page = await browser.newPage({ viewport: { width: +m[1], height: +m[2] }, deviceScaleFactor: 2 });
    await page.goto('file://' + src);
    await page.screenshot({ path: dst });
    await page.close();
    console.log('png', path.basename(dst));
  }
  await browser.close();
})();
