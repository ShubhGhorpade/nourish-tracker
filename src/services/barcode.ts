export interface BarcodeScannerHandle { stop(): void; }
export type BarcodeEngine = 'native' | 'zxing' | 'none';

const WANTED_FORMATS = ['upc_a','upc_e','ean_8','ean_13'];

function nativeDetectorAvailable(): boolean {
  return Boolean('BarcodeDetector' in window && typeof (window as any).BarcodeDetector === 'function');
}

function zxingAvailable(): boolean {
  const z = window.ZXingBrowser;
  return Boolean(z && typeof z.BrowserMultiFormatReader === 'function');
}

export function barcodeScannerEngine(): BarcodeEngine {
  if (nativeDetectorAvailable()) return 'native';
  if (zxingAvailable()) return 'zxing';
  return 'none';
}

function resultText(result: any): string {
  return String(result?.rawValue ?? result?.getText?.() ?? result?.text ?? '').trim();
}

async function nativeScanner(video: HTMLVideoElement, onCode: (code: string) => void, onError: (message: string) => void): Promise<BarcodeScannerHandle> {
  const Detector = (window as any).BarcodeDetector;
  let formats = WANTED_FORMATS;
  try {
    if (typeof Detector.getSupportedFormats === 'function') {
      const supported = await Detector.getSupportedFormats();
      const filtered = WANTED_FORMATS.filter(x => supported.includes(x));
      if (filtered.length) formats = filtered;
    }
  } catch { /* use requested formats */ }
  const detector = new Detector({ formats });
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  video.srcObject = stream;
  video.setAttribute('playsinline','true');
  await video.play();
  let active = true;
  let raf = 0;
  let last = 0;
  const stop = () => {
    active = false;
    cancelAnimationFrame(raf);
    stream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  };
  const loop = async (time: number) => {
    if (!active) return;
    raf = requestAnimationFrame(loop);
    if (time - last < 180 || video.readyState < 2) return;
    last = time;
    try {
      const found = await detector.detect(video);
      const value = resultText(found?.[0]);
      if (value) { onCode(value); stop(); }
    } catch (error) {
      if (active) onError(error instanceof Error ? error.message : 'Barcode scanning failed.');
    }
  };
  raf = requestAnimationFrame(loop);
  return { stop };
}

async function zxingScanner(video: HTMLVideoElement, onCode: (code: string) => void, onError: (message: string) => void): Promise<BarcodeScannerHandle> {
  const z = window.ZXingBrowser;
  if (!z?.BrowserMultiFormatReader) throw new Error('Barcode compatibility scanner did not load. Enter the barcode manually or try again online.');
  const reader = new z.BrowserMultiFormatReader();
  let stopped = false;
  let controls: any;
  const constraints: MediaStreamConstraints = {
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  };
  controls = await reader.decodeFromConstraints(constraints, video, (result: any, error: any, innerControls: any) => {
    if (stopped) return;
    const value = resultText(result);
    if (value) {
      stopped = true;
      try { (innerControls ?? controls)?.stop?.(); } catch { /* noop */ }
      onCode(value);
      return;
    }
    // ZXing reports NotFound on ordinary frames with no barcode; that is not a user-facing error.
    const name = String(error?.name ?? error?.constructor?.name ?? '');
    if (error && !['NotFoundException','ChecksumException','FormatException'].includes(name)) {
      onError(error instanceof Error ? error.message : 'Barcode scanning failed.');
    }
  });
  return {
    stop() {
      stopped = true;
      try { controls?.stop?.(); } catch { /* noop */ }
      const stream = video.srcObject as MediaStream | null;
      stream?.getTracks?.().forEach(track => track.stop());
      video.srcObject = null;
    }
  };
}

export async function startBarcodeScanner(video: HTMLVideoElement, onCode: (code: string) => void, onError: (message: string) => void): Promise<BarcodeScannerHandle> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not available in this browser. Use “Take barcode photo” or manual entry.');
  const engine = barcodeScannerEngine();
  if (engine === 'native') {
    try { return await nativeScanner(video,onCode,onError); }
    catch (error) {
      // Safari exposes experimental APIs in some versions but may still fail at runtime. Fall through to ZXing.
      if (!zxingAvailable()) throw error;
    }
  }
  if (zxingAvailable()) return zxingScanner(video,onCode,onError);
  throw new Error('Live barcode scanning is unavailable in this browser. Use “Take barcode photo” or enter the UPC/EAN manually.');
}

/** Decode a still barcode image. This is the most reliable iPhone fallback when live camera APIs are limited. */
export async function decodeBarcodeImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose or take a barcode photo.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Barcode photo is too large. Use an image under 15 MB.');

  if (nativeDetectorAvailable() && typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const Detector = (window as any).BarcodeDetector;
        const detector = new Detector({ formats: WANTED_FORMATS });
        const found = await detector.detect(bitmap);
        const value = resultText(found?.[0]);
        if (value) return value;
      } finally { bitmap.close(); }
    } catch { /* fall through to ZXing */ }
  }

  const z = window.ZXingBrowser;
  if (!z?.BrowserMultiFormatReader) throw new Error('Barcode image decoding is unavailable right now. Enter the digits printed under the barcode.');
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve,reject)=>{ image.onload=()=>resolve(); image.onerror=()=>reject(new Error('Could not open the barcode photo.')); image.src=url; });
    const reader = new z.BrowserMultiFormatReader();
    const result = await reader.decodeFromImageElement(image);
    const value = resultText(result);
    if (!value) throw new Error('No UPC/EAN barcode was detected. Try a closer photo with the full barcode visible.');
    return value;
  } catch (error) {
    const name = String((error as any)?.name ?? (error as any)?.constructor?.name ?? '');
    if (['NotFoundException','ChecksumException','FormatException'].includes(name)) throw new Error('No readable UPC/EAN barcode was found. Try a closer, sharper photo.');
    throw error;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function barcodeScannerSupported(): boolean {
  return Boolean(typeof navigator.mediaDevices?.getUserMedia === 'function' && barcodeScannerEngine() !== 'none');
}

export function barcodeImageSupported(): boolean {
  return nativeDetectorAvailable() || zxingAvailable();
}
