import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, '..');
const stagingDir = path.join(desktopDir, '.app-staging');
const resourcesDir = path.join(desktopDir, 'dist-package', 'win-unpacked', 'resources');
const asarFile = path.join(resourcesDir, 'app.asar');

fs.rmSync(stagingDir, { recursive: true, force: true });
fs.mkdirSync(stagingDir, { recursive: true });

fs.copyFileSync(path.join(desktopDir, 'package.json'), path.join(stagingDir, 'package.json'));
fs.cpSync(path.join(desktopDir, 'dist'), path.join(stagingDir, 'dist'), { recursive: true });
fs.cpSync(path.join(desktopDir, 'src'), path.join(stagingDir, 'src'), { recursive: true });

fs.mkdirSync(resourcesDir, { recursive: true });
execSync(`npx --yes @electron/asar pack "${stagingDir}" "${asarFile}"`, { stdio: 'inherit' });
fs.rmSync(stagingDir, { recursive: true, force: true });
console.log(`[UpdateAsar] Successfully updated ${asarFile}`);
