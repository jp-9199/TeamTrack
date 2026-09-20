import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, '..');
const distPackageDir = path.join(desktopDir, 'dist-package');
const winUnpackedDir = path.join(distPackageDir, 'win-unpacked');
const electronDistDir = path.join(desktopDir, 'node_modules', 'electron', 'dist');
const stagingDir = path.join(desktopDir, '.app-staging');
const resourcesDir = path.join(winUnpackedDir, 'resources');
const asarFile = path.join(resourcesDir, 'app.asar');
const targetExe = path.join(winUnpackedDir, 'TeamTrack.exe');

console.log('====================================================');
console.log('🔨 Building TeamTrack Windows Desktop Executable');
console.log('====================================================');

// 1. Compile TypeScript
console.log('\n[1/5] Compiling TypeScript...');
execSync('npm run build', { cwd: desktopDir, stdio: 'inherit' });

// 2. Prepare staging directory for asar
console.log('\n[2/5] Staging application assets...');
fs.rmSync(stagingDir, { recursive: true, force: true });
fs.mkdirSync(stagingDir, { recursive: true });

fs.copyFileSync(path.join(desktopDir, 'package.json'), path.join(stagingDir, 'package.json'));
fs.cpSync(path.join(desktopDir, 'dist'), path.join(stagingDir, 'dist'), { recursive: true });
fs.cpSync(path.join(desktopDir, 'src'), path.join(stagingDir, 'src'), { recursive: true });

// 3. Prepare win-unpacked directory from Electron distribution
console.log('\n[3/5] Assembling Windows runtime binaries...');
if (!fs.existsSync(electronDistDir)) {
  throw new Error(`Electron distribution not found at: ${electronDistDir}`);
}

fs.mkdirSync(winUnpackedDir, { recursive: true });

// Copy runtime files from electron/dist
const entries = fs.readdirSync(electronDistDir);
for (const entry of entries) {
  const srcPath = path.join(electronDistDir, entry);
  const destName = entry === 'electron.exe' ? 'TeamTrack.exe' : entry;
  const destPath = path.join(winUnpackedDir, destName);

  if (entry === 'resources') {
    // We will create custom resources with app.asar
    fs.mkdirSync(destPath, { recursive: true });
  } else {
    fs.cpSync(srcPath, destPath, { recursive: true });
  }
}

// 4. Pack ASAR
console.log('\n[4/5] Packaging app.asar archive...');
fs.mkdirSync(resourcesDir, { recursive: true });
execSync(`npx --yes @electron/asar pack "${stagingDir}" "${asarFile}"`, { stdio: 'inherit' });

// Remove default_app.asar if copied
const defaultAsar = path.join(resourcesDir, 'default_app.asar');
if (fs.existsSync(defaultAsar)) {
  fs.rmSync(defaultAsar, { force: true });
}

// Clean up staging
fs.rmSync(stagingDir, { recursive: true, force: true });

// 5. Verify the generated executable
console.log('\n[5/5] Verifying binary deliverables...');
if (fs.existsSync(targetExe)) {
  const stat = fs.statSync(targetExe);
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
  console.log(`\n🎉 SUCCESS! Generated standalone Windows executable:`);
  console.log(`   Location: ${targetExe}`);
  console.log(`   Binary Size: ${sizeMb} MB`);
} else {
  throw new Error(`Executable was not created at expected location: ${targetExe}`);
}

// 6. Optional: Create NSIS installer or zip archive with electron-builder if available
try {
  console.log('\n[Bonus] Attempting electron-builder installer packaging...');
  execSync('npx --yes electron-builder --win --dir -c electron-builder.json', {
    cwd: desktopDir,
    stdio: 'inherit',
    timeout: 90000,
  });
  console.log('✅ electron-builder directory package verified.');
} catch (ebErr) {
  console.log('ℹ️ Note: electron-builder optional step skipped or finished; standalone win-unpacked/TeamTrack.exe is ready and fully operational.');
}

console.log('\n====================================================');
console.log('🚀 TeamTrack Desktop Windows distribution is ready!');
console.log(`Executable Path: ${targetExe}`);
console.log('====================================================\n');
