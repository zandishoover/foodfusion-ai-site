import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const targetPath = path.resolve('node_modules/expo-dev-menu/ios/DevMenuViewController.swift');
const legacyCheck = '    let isSimulator = TARGET_IPHONE_SIMULATOR > 0';
const supportedCheck = [
  '    #if targetEnvironment(simulator)',
  '      let isSimulator = true',
  '    #else',
  '      let isSimulator = false',
  '    #endif'
].join('\n');

try {
  const source = await readFile(targetPath, 'utf8');
  if (source.includes(legacyCheck)) {
    await writeFile(targetPath, source.replace(legacyCheck, supportedCheck));
    console.log('Applied expo-dev-menu Xcode simulator compatibility patch.');
  }
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw error;
  }
}
