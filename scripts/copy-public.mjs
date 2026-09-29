import { cp, mkdir, access } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true, force: true });
// @zxing/browser is copied into the static build so barcode scanning does not rely on a CDN.
try {
  await access('node_modules/@zxing/browser/umd/zxing-browser.min.js');
  await mkdir('dist/vendor', { recursive: true });
  await cp('node_modules/@zxing/browser/umd/zxing-browser.min.js', 'dist/vendor/zxing-browser.min.js', { force: true });
} catch {
  // Local source-only checks can still build without node_modules present; production CI runs npm install first.
  console.warn('ZXing barcode runtime was not found in node_modules; camera/image barcode compatibility fallback will be unavailable in this build.');
}
