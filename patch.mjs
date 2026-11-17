import fs from 'fs';
import path from 'path';

const targetPath = path.resolve('node_modules', 'whatsapp-web.js', 'src', 'util', 'Injected', 'Utils.js');

if (fs.existsSync(targetPath)) {
  let content = fs.readFileSync(targetPath, 'utf8');
  const regex = /cannotBeRanked:\s*window\s*\.require\('WAWebStatusGatingUtils'\)\s*\.canCheckStatusRankingPosterGating\(\),/;
  if (regex.test(content)) {
    const replacement = `cannotBeRanked: (() => {
                        try {
                            const u = window.require('WAWebStatusGatingUtils');
                            return typeof u?.canCheckStatusRankingPosterGating === 'function' ? u.canCheckStatusRankingPosterGating() : false;
                        } catch (e) {
                            return false;
                        }
                    })(),`;
    content = content.replace(regex, replacement);
    fs.writeFileSync(targetPath, content, 'utf8');
    console.log('✅ Patched whatsapp-web.js Utils.js successfully!');
  } else {
    console.log('ℹ️ whatsapp-web.js is already patched.');
  }
}
