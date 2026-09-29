/** Draws through canvas to strip EXIF/metadata and resize before any external processing. */
export async function prepareImage(file: File, maxDimension = 1280, quality = 0.82): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Image is too large. Choose a file under 15 MB.');

  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let cleanup: () => void = () => {};

  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
    cleanup = () => bitmap.close();
  } else {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This browser could not decode the image.')); };
      img.src = url;
    });
    source = image;
    width = image.naturalWidth;
    height = image.naturalHeight;
  }

  try {
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const outputWidth = Math.max(1, Math.round(width * scale));
    const outputHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image processing is unavailable in this browser.');
    ctx.drawImage(source, 0, 0, outputWidth, outputHeight);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    cleanup();
  }
}
