/**
 * 打包「本地单文件版」：把 styles.css 与 app-local.js 内联进 index-local.html，
 * 产出一个可双击直接打开、无需服务器的 HTML 文件。
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, 'share', 'index-local.html'), 'utf-8');
const css = fs.readFileSync(path.join(ROOT, 'share', 'styles.css'), 'utf-8');
const js = fs.readFileSync(path.join(ROOT, 'share', 'app-local.js'), 'utf-8');

const out = html
  .replace('<!--INLINE_STYLES-->', '<style>\n' + css + '\n</style>')
  .replace('<!--INLINE_SCRIPT-->', '<script>\n' + js + '\n</script>');

const outDir = path.resolve(ROOT, '..');
const outFile = path.join(outDir, '健康内容中台-本地版.html');
fs.writeFileSync(outFile, out, 'utf-8');
console.log('已生成：' + outFile);
console.log('大小：' + (Buffer.byteLength(out, 'utf-8') / 1024).toFixed(1) + ' KB');
