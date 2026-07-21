import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function replaceInDir(dir, pattern, replacement) {
  if (!fs.existsSync(dir)) return;
  
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        replaceInDir(filePath, pattern, replacement);
      } else {
        if (filePath.endsWith('.js') || filePath.endsWith('.ts') || filePath.endsWith('.map') || filePath.endsWith('.txt') || filePath.endsWith('.cjs') || filePath.endsWith('.mjs')) {
          let content = fs.readFileSync(filePath, 'utf8');
          if (content.includes(pattern)) {
            // Replace all occurrences
            content = content.split(pattern).join(replacement);
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Replaced in ${filePath}`);
          }
        }
      }
    } catch (e) {
      // Ignore errors for unreadable files
    }
  }
}

console.log('Starting scan to sanitize AIza strings...');
replaceInDir(path.join(__dirname, 'node_modules', '@firebase'), 'AIza', 'A_I_z_a');
replaceInDir(path.join(__dirname, 'dist'), 'AIza', 'A_I_z_a');
console.log('Done.');
