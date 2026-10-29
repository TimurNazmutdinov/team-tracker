// Рендерит PNG из SVG логотипа: значок приложения 512 и 192 px, favicon 32 px (Chromium из Playwright).
// Запуск (после python3 scripts/build_logo.py): node scripts/build_logo_png.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const logo = path.resolve(__dirname, '..', 'Logo');
const jobs = [
  ['app-icon.svg', 'app-icon-512.png', 512],
  ['app-icon.svg', 'app-icon-192.png', 192],
  ['favicon.svg', 'favicon-32.png', 32],
];

(async () => {
  const browser = await chromium.launch();
  for (const palette of fs.readdirSync(logo).filter((d) => fs.statSync(path.join(logo, d)).isDirectory())) {
    for (const [src, dst, size] of jobs) {
      const svg = fs.readFileSync(path.join(logo, palette, src), 'utf8');
      const page = await browser.newPage({ viewport: { width: size, height: size } });
      await page.setContent(
        `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
      );
      await page.screenshot({ path: path.join(logo, palette, dst), omitBackground: true });
      await page.close();
      console.log('png', `Logo/${palette}/${dst}`);
    }
  }
  await browser.close();
})();
