import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(process.argv[2] || path.join(root, 'dist/Hook-Arena.html'));
const [template, css, engine, camera, game] = await Promise.all(
  ['index.html', 'style.css', 'engine.js', 'camera.js', 'game.js'].map(name => readFile(path.join(root, name), 'utf8')),
);
const styleTag = '<link rel="stylesheet" href="style.css">';
const scriptTag = '<script type="module" src="game.js"></script>';
if (!template.includes(styleTag) || !template.includes(scriptTag)) throw new Error('Download template tags are missing');
const js = [engine, camera, game].map(source => source.replace(/^export /gm, '').replace(/^import .* from '\.\/(engine|camera)\.js';\n/gm, '')).join('\n');
const html = template.replace(styleTag, `<style>\n${css}\n</style>`)
  .replace(scriptTag, `<script type="module">\n${js}\n</script>`)
  .replace('href="./" aria-label="鉤魂競技場首頁"', 'href="" aria-label="鉤魂競技場首頁"');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, html);
await chmod(output, 0o644);
console.log(`Standalone game: ${output}`);
