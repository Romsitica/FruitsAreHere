// Android 导出脚本只复制 app.js/app.css：将本目录素材内嵌，保持离线可用。
// 换图标或主视觉后，在项目根目录运行 node mobile/customer/tests/embed-assets.cjs。
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
let css = fs.readFileSync(path.join(root, 'app.css'), 'utf8');
for (const filename of fs.readdirSync(path.join(root, 'assets')).filter(f => f.endsWith('.svg'))) {
  const name = filename.replace('.svg', '');
  const svg = fs.readFileSync(path.join(root, 'assets', filename), 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();
  const url = 'data:image/svg+xml,' + encodeURIComponent(svg).replace(/'/g, '%27');
  css = css.replace(new RegExp('(\\.ct-icon-' + name + ' \\{ --ct-icon: )url\\([^\\n]*?\\)'), (_, prefix) => prefix + 'url("' + url + '")');
}
const image = fs.readFileSync(path.join(root, 'assets/fruit-hero.jpg')).toString('base64');
css = css.replace(/\/\* ct-embedded-hero \*\/[^\n]*/, '/* ct-embedded-hero */ background-image: url("data:image/jpeg;base64,' + image + '");');
fs.writeFileSync(path.join(root, 'app.css'), css);
console.log('Embedded local photo and Tabler icons into customer/app.css');
