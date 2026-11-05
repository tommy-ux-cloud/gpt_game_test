import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(process.argv[2] || path.join(root, 'dist/Hook-Arena.html'));
const [template, css, peerCode, peerLicense] = await Promise.all(['index.html', 'style.css', 'vendor/peerjs.min.js', 'vendor/PEERJS-LICENSE.txt'].map(name => readFile(path.join(root, name), 'utf8')));
const styleTag = '<link rel="stylesheet" href="style.css">';
const scriptTag = '<script type="module" src="game.js"></script>';
const peerTag = '<script src="vendor/peerjs.min.js" defer></script>';
if (!template.includes(styleTag) || !template.includes(scriptTag) || !template.includes(peerTag)) throw new Error('Download template tags are missing');
// Bundle the module graph and the exact PNGs used by the live game. Blob modules
// and embedded data images work without a server, CDN, WebGL or installation.
const modules = {};
const assets = {};
for (const name of ['assets/pig-blue-atlas.png', 'assets/pig-red-atlas.png']) assets[name] = 'data:image/png;base64,' + (await readFile(path.join(root, name))).toString('base64');
async function collect(name) {
  if (Object.hasOwn(modules, name)) return;
  const source = await readFile(path.join(root, name), 'utf8'); modules[name] = '';
  const dependencies = [];
  modules[name] = source.replace(/(['"])(assets\/pig-(?:blue|red)-atlas\.png)\1/g, (_, quote, asset) => quote + assets[asset] + quote).replace(/\bfrom\s*(['"])(\.{1,2}\/[^'"]+)\1/g, (match, quote, relative) => {
    const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(name), relative));
    if (dependency.startsWith('../')) throw new Error('Module outside game root');
    dependencies.push(dependency);
    return `from ${quote}__HOOK_MODULE__/${dependency}${quote}`;
  }).replace(/^\/\/# sourceMappingURL=.*$/gm, '');
  for (const dependency of dependencies) await collect(dependency);
}
await collect('game.js');
const sources = JSON.stringify(modules).replace(/</g, '\\u003c');
const bootstrap = `const sources=${sources};
const urls=new Map();
function moduleURL(name){
  if(urls.has(name))return urls.get(name);
  const source=sources[name].replace(/(['"])__HOOK_MODULE__\\/([^'"]+)\\1/g,(_,quote,dependency)=>quote+moduleURL(dependency)+quote);
  const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));urls.set(name,url);return url;
}
import(moduleURL('game.js')).catch(error=>{
  console.error(error);document.getElementById('overlay-description').textContent='遊戲未能啟動，請使用最新版桌面瀏覽器開啟。';
});`;
const html = template.replace(peerTag, () => '<script>/* PeerJS 1.5.5\n' + peerLicense + '*/\n' + peerCode.replace(/<\/script/gi, '<\\/script') + '\n</script>').replace(styleTag, () => `<style>\n${css}\n</style>`)
  .replace(scriptTag, () => `<script type="module">\n${bootstrap}\n</script>`)
  .replace('href="./" aria-label="鉤魂競技場首頁"', 'href="" aria-label="鉤魂競技場首頁"');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, html);
await chmod(output, 0o644);
console.log(`Standalone game: ${output} (${Object.keys(modules).length} bundled modules)`);
