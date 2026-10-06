/** Longest edge sent to the label reader - enough to read small print, a fraction of a phone photo's size. */
const MAX_EDGE = 2000;
const MAX_PDF_BYTES = 8 * 1024 * 1024;

export class LabelFileError extends Error {}

/**
 * Phone photos are 4-12 MB; the label reader needs far less. Downscale in the browser
 * (and honour EXIF rotation) so uploads are quick on mobile data. PDFs pass through.
 */
export async function prepareLabelFile(file: File): Promise<{ blob: Blob; name: string; previewUrl: string | null }> {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_PDF_BYTES) throw new LabelFileError('That PDF is over 8 MB - use a photo of the label instead.');
    return { blob: file, name: file.name, previewUrl: null };
  }
  if (!file.type.startsWith('image/')) {
    throw new LabelFileError('Choose a photo (JPG, PNG) or a PDF of the label.');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new LabelFileError(
      'This browser can’t open that photo format (often HEIC from an iPhone). Take a screenshot of it, or set the camera to “Most compatible”.'
    );
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new LabelFileError('Couldn’t prepare that photo - try another one.');
  ctx.fillStyle = '#fff'; // transparent PNGs would otherwise turn black in JPEG
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  if (!blob) throw new LabelFileError('Couldn’t prepare that photo - try another one.');
  return { blob, name: file.name.replace(/\.[^.]+$/, '') + '.jpg', previewUrl: URL.createObjectURL(blob) };
}
