// Rebuild the portable demo with local assets and the pinned Swiper library.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = path.join(__dirname, 'homepage-layout-demo.html');
let html = fs.readFileSync(source, 'utf8');
const vendor = path.join(__dirname, 'vendor/swiper-14.3.0');
const css = fs.readFileSync(path.join(vendor, 'swiper-bundle.min.css'), 'utf8').replace(/\/\*# sourceMappingURL=.*?\*\//g, '');
const js = fs.readFileSync(path.join(vendor, 'swiper-bundle.min.js'), 'utf8').replace(/\/\/# sourceMappingURL=.*/g, '');
const license = fs.readFileSync(path.join(vendor, 'LICENSE'), 'utf8');
html = html.replace('<link rel="stylesheet" href="vendor/swiper-14.3.0/swiper-bundle.min.css">', () => '<style>' + css + '</style>');
html = html.replace('<script src="vendor/swiper-14.3.0/swiper-bundle.min.js"></script>', () => '<script>/* Swiper 14.3.0\n' + license + '\n*/\n' + js.replace(/<\/script/gi, '<\\/script') + '</script>');
const assets = [...new Set([...html.matchAll(/["']((?:\.\.\/)+(?:previews|frontend)\/[^"']+)["']/g)].map(match => match[1]))];
for (const asset of assets) {
  const file = path.resolve(__dirname, asset);
  const mime = path.extname(file) === '.svg' ? 'image/svg+xml' : 'image/png';
  html = html.split(asset).join('data:' + mime + ';base64,' + fs.readFileSync(file).toString('base64'));
}
for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
if (/(?:\.\.\/)+(?:previews|frontend)\//.test(html) || /(?:src|href)="vendor\//.test(html)) throw Error('Unbundled dependency');
const output = path.resolve(__dirname, '../previews/homepage-motion-demo.html');
fs.writeFileSync(output, html);
console.log(`Portable demo: ${output}; ${assets.length} embedded assets; Swiper 14.3.0`);
