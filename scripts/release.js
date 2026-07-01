#!/usr/bin/env node
/**
 * ChenDoc 发布打包脚本
 * 生成两份压缩包：公共包(不含内部文档) + 服务器包(含内部排查文档)
 * 用法: node scripts/release.js [--skip-build] [--skip-git] [--skip-release]
 */

import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { execSync } from 'child_process';

const __dirname = import.meta.dirname;
const rootDir = path.resolve(__dirname, '..');

// 命令行参数
const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const skipGit = args.includes('--skip-git');
const skipRelease = args.includes('--skip-release');

console.log('=== ChenDoc 发布打包 ===');
console.log(`工作目录: ${rootDir}`);

// ========== 1. 读取版本 ==========
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = pkg.version;
console.log(`当前版本: ${version}`);

const publicZip = path.join(rootDir, 'release', `chendoc-${version}-public.zip`);
const serverZip = path.join(rootDir, 'release', `chendoc-${version}-server.zip`);

// 创建 release 目录
const releaseDir = path.join(rootDir, 'release');
if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir, { recursive: true });
}

// ========== 2. 构建 ==========
if (!skipBuild) {
  console.log('\n[1/5] 执行构建...');

  console.log('  安装依赖...');
  execSync('npm ci --workspaces --include-workspace-root', {
    cwd: rootDir,
    stdio: 'inherit'
  });

  console.log('  构建前后端...');
  execSync('npm run build', {
    cwd: rootDir,
    stdio: 'inherit'
  });

  console.log('  构建完成');
} else {
  console.log('\n[1/5] 跳过构建');
}

// ========== 3. 准备打包目录 ==========
console.log('\n[2/5] 准备打包...');

const tmpDir = path.join(rootDir, '.tmp', `release-${version}`);
const publicTmp = path.join(tmpDir, 'public-pkg');
const serverTmp = path.join(tmpDir, 'server-pkg');

// 清理旧临时目录
if (fs.existsSync(tmpDir)) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
fs.mkdirSync(publicTmp, { recursive: true });
fs.mkdirSync(serverTmp, { recursive: true });

// 必须排除的目录和文件
const mustExcludeDirs = new Set([
  '.git',
  'node_modules',
  'apps/admin/node_modules',
  'server/node_modules',
  'data',
  '.tmp',
  'backups',
  'logs',
  '.claude',
  '.agents',
  '.codex',
  '.playwright-mcp',
  '.spectrai',
  '.spectrai-worktrees',
  '.tools',
  'reports',
  'skills',
  '.vscode',
  'release'
]);

// 必须排除的文件
const mustExcludeFiles = new Set([
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  'package-lock.json'
]);

// 扩展名的文件排除
const excludeExtensions = ['.log', '.sqlite', '.sqlite-shm', '.sqlite-wal'];

// 公共包额外排除的文件和目录
const publicExclude = new Set([
  'docs',
  '超记忆副本.md',
  '更改必读规范.md',
  '优化建议.md',
  '安全审计.md',
  '开发者-分析报告.md',
  '用户-分析报告.md',
  'FILE_GUIDE.md',
  'AGENTS.md',
  'DEPLOY_README.md',
  'DESIGN_LANGUAGE.md',
  'PRODUCT.md',
  'FORM_SECURITY.md',
  'ecosystem.config.cjs',
  'move-css-files.ps1',
  'move-css-files.sh',
  'move-css.bat',
  '打开CMD.bat',
  '.gitignore',
  '.gitattributes',
  'playwright.config.ts',
  'vitest.config.ts',
  'vitest.contig.ts'
]);

// 公共包额外排除的图片
const publicExcludePatterns = [
  /screenshot/i,
  /截图/i,
  /\.png$/i,
  /\.PNG$/i,
  /\.jpg$/i,
  /\.jpeg$/i,
  /\.gif$/i,
  /\.bmp$/i,
  /\.ico$/i,
  /register-page/i,
  /settings-page/i,
  /trash-page/i,
  /desktop-bg\.jpg$/i,
  /chendoc.*\.log$/i,
  /console-\d+.*\.log$/i,
  /dev-server.*\.log$/i,
  /\.test\.ts$/i,
  /\.spec\.ts$/i
];

function shouldExcludePublic(name, fullPath) {
  if (publicExclude.has(name)) return true;
  for (const pattern of publicExcludePatterns) {
    if (pattern.test(name) || pattern.test(fullPath)) return true;
  }
  return false;
}

// 递归复制并过滤
function copyFiltered(srcDir, destDir, isPublic) {
  if (!fs.existsSync(srcDir)) return 0;

  let count = 0;
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const relPath = path.relative(rootDir, srcPath).replace(/\\/g, '/');

    // 跳过必须排除的目录
    if (entry.isDirectory()) {
      if (mustExcludeDirs.has(entry.name)) continue;
      // 公共包额外排除目录
      if (isPublic && publicExclude.has(entry.name)) continue;
      count += copyFiltered(srcPath, path.join(destDir, entry.name), isPublic);
      continue;
    }

    // 是文件
    if (entry.isFile()) {
      // 跳过必须排除的文件
      if (mustExcludeFiles.has(entry.name)) continue;

      // 检查扩展名
      const ext = path.extname(entry.name).toLowerCase();
      if (excludeExtensions.includes(ext)) continue;

      // 公共包额外检查
      if (isPublic && shouldExcludePublic(entry.name, relPath)) continue;

      // 复制文件
      const destPath = path.join(destDir, relPath);
      const destFileDir = path.dirname(destPath);
      if (!fs.existsSync(destFileDir)) {
        fs.mkdirSync(destFileDir, { recursive: true });
      }
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }

  return count;
}

// 复制文件
console.log('  打包公共包...');
const publicCount = copyFiltered(rootDir, publicTmp, true);
console.log(`    公共包: ${publicCount} 文件`);

console.log('  打包服务器包...');
const serverCount = copyFiltered(rootDir, serverTmp, false);
console.log(`    服务器包: ${serverCount} 文件`);

// ========== 4. 生成压缩包 ==========
console.log('\n[3/5] 生成压缩包...');

async function createZip(sourceDir, outputPath) {
  const zip = new JSZip();

  // 递归添加目录中的文件
  function addDirToZip(dir, zipDir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const zipPath = zipDir ? `${zipDir}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        addDirToZip(fullPath, zipPath);
      } else {
        const content = fs.readFileSync(fullPath);
        zip.file(zipPath, content);
      }
    }
  }

  addDirToZip(sourceDir, '');
  const buffer = await zip.generateAsync({
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    type: 'nodebuffer'
  });

  fs.writeFileSync(outputPath, buffer);
  return buffer.length;
}

// 清理旧压缩包
if (fs.existsSync(publicZip)) fs.unlinkSync(publicZip);
if (fs.existsSync(serverZip)) fs.unlinkSync(serverZip);

console.log('  创建公共包...');
await createZip(publicTmp, publicZip);
console.log(`  公共包: ${publicZip}`);

console.log('  创建服务器包...');
await createZip(serverTmp, serverZip);
console.log(`  服务器包: ${serverZip}`);

// 计算 SHA256
console.log('\n  SHA-256 校验:');

function sha256(filePath) {
  const content = fs.readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

console.log('  公共包:');
console.log(`    ${sha256(publicZip)}`);
console.log('  服务器包:');
console.log(`    ${sha256(serverZip)}`);

// 清理临时目录
fs.rmSync(tmpDir, { recursive: true, force: true });

// ========== 5. Git 提交 ==========
if (!skipGit) {
  console.log('\n[4/5] Git 提交...');

  // 检查最新提交
  const latestCommit = execSync('git log -1 --format=%s', { cwd: rootDir }).toString().trim();
  const expectedMsg = `Release ChenDoc v${version}`;

  if (latestCommit === expectedMsg) {
    console.log(`  版本 ${version} 已提交，跳过`);
  } else {
    console.log('  创建提交和 tag...');

    // 添加文件并提交
    execSync('git add -A', { cwd: rootDir });
    execSync(`git commit -m "${expectedMsg}"`, { cwd: rootDir });
    execSync(`git tag v${version}`, { cwd: rootDir });

    console.log(`  已提交并创建 tag v${version}`);

    // 推送到 GitHub
    console.log('  推送到 GitHub...');
    try {
      execSync(`git push origin main --tags`, { cwd: rootDir, stdio: 'inherit' });
      console.log('  推送完成');
    } catch (e) {
      console.log('  推送失败，请手动推送');
      console.log(`  命令: git push origin main --tags`);
    }
  }
} else {
  console.log('\n[4/5] 跳过 Git');
}

// ========== 6. 创建 GitHub Release ==========
if (!skipRelease) {
  console.log('\n[5/5] 创建 GitHub Release...');

  let ghAvailable = false;
  try {
    execSync('gh --version', { cwd: rootDir, stdio: 'pipe' });
    ghAvailable = true;
  } catch {
    console.log('  gh CLI 不可用，跳过 Release 创建');
    console.log('  请手动在 GitHub 创建 Release 或等 CI 自动触发');
  }

  if (ghAvailable) {
    try {
      // 检查是否已存在
      const existing = execSync(`gh release view v${version} 2>/dev/null || true`, {
        cwd: rootDir
      }).toString();

      if (existing.includes('v' + version)) {
        console.log(`  Release v${version} 已存在`);
      } else {
        // 生成发布说明
        const changelog = fs.readFileSync(path.join(rootDir, 'CHANGELOG.md'), 'utf8');
        const marker = `### ${version}`;
        const start = changelog.indexOf(marker);

        if (start >= 0) {
          let rest = changelog.substring(start + marker.length);
          const end = rest.indexOf('\n###');
          if (end > 0) {
            rest = rest.substring(0, end);
          }
          const body = rest.trim();

          // 创建 Release Notes 文件
          const notesFile = path.join(rootDir, '.tmp', 'release-notes.md');
          fs.mkdirSync(path.dirname(notesFile), { recursive: true });
          fs.writeFileSync(notesFile, `# ChenDoc v${version}\n\n${body}\n`);

          console.log('  创建 Release...');
          execSync(`gh release create v${version} --title "ChenDoc v${version}" --notes-file "${notesFile}" --target HEAD`, {
            cwd: rootDir,
            stdio: 'inherit'
          });

          // 上传压缩包
          console.log('  上传公共包...');
          execSync(`gh release upload v${version} "${publicZip}" --clobber`, {
            cwd: rootDir,
            stdio: 'inherit'
          });

          console.log('  上传服务器包...');
          execSync(`gh release upload v${version} "${serverZip}" --clobber`, {
            cwd: rootDir,
            stdio: 'inherit'
          });

          console.log(`  Release 创建完成: https://github.com/cxiao4128/chendoc/releases/tag/v${version}`);
        } else {
          console.log(`  找不到 CHANGELOG.md 中 ${version} 的内容`);
        }
      }
    } catch (e) {
      console.log('  Release 创建失败，请手动创建');
    }
  }
} else {
  console.log('\n[5/5] 跳过 Release');
}

// ========== 完成 ==========
console.log('\n=== 打包完成 ===');
console.log(`公共包: ${publicZip}`);
console.log(`服务器包: ${serverZip}`);