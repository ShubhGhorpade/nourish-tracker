export interface BarcodeScannerHandle { stop(): void; }

export async function startBarcodeScanner(video: HTMLVideoElement, onCode: (code: string) => void, onError: (message: string) => void): Promise<BarcodeScannerHandle> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not available in this browser.');
  if (!('BarcodeDetector' in window) || typeof (window as any).BarcodeDetector !== 'function') throw new Error('This browser does not provide on-device barcode detection. Use manual barcode entry or scan the nutrition label instead.');
  const formats = ['upc_a','upc_e','ean_8','ean_13'];
  const detector = new (window as any).BarcodeDetector({ formats });
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  video.srcObject = stream;
  await video.play();
  let active = true;
  let raf = 0;
  let last = 0;
  const loop = async (time: number) => {
    if (!active) return;
    raf = requestAnimationFrame(loop);
    if (time - last < 160 || video.readyState < 2) return;
    last = time;
    try {
      const found = await detector.detect(video);
      const value = found?.[0]?.rawValue;
      if (value) { active = false; onCode(String(value)); stop(); }
    } catch (error) {
      if (active) onError(error instanceof Error ? error.message : 'Barcode scanning failed.');
    }
  };
  raf = requestAnimationFrame(loop);
  const stop = () => {
    active = false;
    cancelAnimationFrame(raf);
    stream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  };
  return { stop };
}

export function barcodeScannerSupported(): boolean {
  return Boolean(typeof (navigator as any).mediaDevices?.getUserMedia === 'function' && 'BarcodeDetector' in window && typeof (window as any).BarcodeDetector === 'function');
}
