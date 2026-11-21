// Secure Keystore Rotation Script
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const workspaceRoot = path.resolve(__dirname, '..');
const androidDir = path.join(workspaceRoot, 'frontend', 'android');
const appDir = path.join(androidDir, 'app');

const oldKeystorePath = path.join(appDir, 'billmate-release-key.jks');
const backupKeystorePath = path.join(appDir, 'billmate-release-key.old.backup.jks');
const newKeystorePath = path.join(appDir, 'billmate-release-v2.jks');
const signingPropsPath = path.join(androidDir, 'signing.properties');

// 1. Preserve old keystore as backup
if (fs.existsSync(oldKeystorePath) && !fs.existsSync(backupKeystorePath)) {
  fs.copyFileSync(oldKeystorePath, backupKeystorePath);
  console.log(`[OK] Old keystore backed up to: ${backupKeystorePath}`);
}

// 2. Generate strong, cryptographically secure random password
const securePassword = crypto.randomBytes(32).toString('hex');
const newAlias = 'billmate-release-key-v2';

// 3. Remove any previous v2 keystore if present so we start completely fresh
if (fs.existsSync(newKeystorePath)) {
  fs.unlinkSync(newKeystorePath);
}

// 4. Invoke keytool to generate RSA 2048-bit keystore
const keytoolPath = 'C:\\Program Files\\Java\\jdk-21.0.10\\bin\\keytool.exe';
const dname = 'CN=BillMate Release v2, OU=Mobile Engineering, O=BillMate App, L=Bengaluru, ST=Karnataka, C=IN';

const keytoolArgs = [
  '-genkeypair',
  '-keystore', newKeystorePath,
  '-alias', newAlias,
  '-keyalg', 'RSA',
  '-keysize', '2048',
  '-validity', '10000',
  '-dname', dname,
  '-storepass', securePassword,
  '-keypass', securePassword,
  '-storetype', 'PKCS12'
];

const res = spawnSync(keytoolPath, keytoolArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
if (res.status !== 0) {
  console.error('[FAIL] Keytool generation failed:', res.stderr.toString());
  process.exit(1);
}

console.log('[OK] Generated new RSA 2048-bit PKCS12 keystore successfully.');
console.log(`[OK] New Keystore file: ${newKeystorePath}`);
console.log(`[OK] New Key Alias: ${newAlias}`);

// 5. Write signing.properties locally
const propsContent = [
  '# BillMate Android APK Production Signing Properties',
  '# Generated automatically with secure random credentials',
  '# NEVER COMMIT THIS FILE TO GIT',
  'BILLMATE_KEYSTORE_PATH=billmate-release-v2.jks',
  `BILLMATE_KEYSTORE_PASSWORD=${securePassword}`,
  `BILLMATE_KEY_ALIAS=${newAlias}`,
  `BILLMATE_KEY_PASSWORD=${securePassword}`,
  ''
].join('\n');

fs.writeFileSync(signingPropsPath, propsContent, { encoding: 'utf8', mode: 0o600 });
console.log(`[OK] Wrote new credentials to local signing.properties safely without stdout exposure.`);
