const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const miniPath = path.join(root, 'zhusheng-sleep-figma.html');
const adminPath = path.join(root, 'zhusheng-admin.html');
const mini = fs.readFileSync(miniPath, 'utf8');
const admin = fs.readFileSync(adminPath, 'utf8');

function localResourceReferences(html) {
  const refs = [];
  const attr = /(?:src|poster|href)="([^"]+)"/g;
  const css = /url\(["']?([^"')]+)["']?\)/g;
  for (const regex of [attr, css]) {
    let match;
    while ((match = regex.exec(html))) {
      const value = match[1];
      if (value.startsWith('./') || value.startsWith('image/')) refs.push(value);
    }
  }
  return [...new Set(refs)];
}

test('小程序使用离线共享核心且不依赖网络启动', () => {
  assert.match(mini, /<base href="\.\/">/);
  assert.match(mini, /<script src="\.\/zhusheng-core\.js"><\/script>/);
  assert.doesNotMatch(mini, /<script[^>]+type="module"/);
  assert.doesNotMatch(mini, /fetch\s*\(/);
  assert.doesNotMatch(mini, /https?:\/\//);
  assert.doesNotMatch(mini, /localhost|127\.0\.0\.1/);
});

test('小程序移除强制登录和提醒流程', () => {
  assert.doesNotMatch(mini, /data-screen="login"|data-screen="register"|data-screen="permission"/);
  assert.doesNotMatch(mini, /id="wechatLogin"|id="registerForm"|id="reminderToggle"/);
  assert.match(mini, /data-next="guide-rest"/);
});

test('小程序提供运营配置与本地备份导入导出', () => {
  assert.match(mini, /id="importConfigInput"/);
  assert.match(mini, /id="exportBackup"/);
  assert.match(mini, /id="importBackupInput"/);
  assert.match(mini, /id="legalDialog"/);
});

test('后台提供统一配置导出和最后修改信息', () => {
  assert.match(admin, /<base href="\.\/">/);
  assert.match(admin, /<script src="\.\/zhusheng-core\.js"><\/script>/);
  assert.match(admin, /id="exportConfig"/);
  assert.match(admin, /id="lastModified"/);
});

test('后台艺术作品要求完整奖励素材', () => {
  assert.match(admin, /id="newThumb"/);
  assert.match(admin, /id="newImage"/);
  assert.match(admin, /id="newAlt"/);
  assert.match(admin, /id="newSource"[^>]+required/);
  assert.doesNotMatch(admin, /reminderLead|gentleReminder|订阅一次/);
});

test('两个 HTML 的本地资源引用都能解析', () => {
  for (const [file, html] of [[miniPath, mini], [adminPath, admin]]) {
    for (const ref of localResourceReferences(html)) {
      const clean = ref.split(/[?#]/)[0];
      const absolute = path.resolve(path.dirname(file), clean);
      assert.equal(fs.existsSync(absolute), true, `${path.basename(file)} 缺少资源 ${ref}`);
    }
  }
});

test('小程序图片扩展名与实际文件格式一致', () => {
  for (const ref of localResourceReferences(mini).filter(value => /\.(?:png|jpe?g)$/i.test(value))) {
    const absolute = path.resolve(path.dirname(miniPath), ref);
    const header = fs.readFileSync(absolute).subarray(0, 8).toString('hex');
    if (/\.png$/i.test(ref)) assert.equal(header, '89504e470d0a1a0a', `${ref} 实际不是 PNG`);
    if (/\.jpe?g$/i.test(ref)) assert.equal(header.startsWith('ffd8ff'), true, `${ref} 实际不是 JPEG`);
  }
});
