/**
 * A label photo made small enough to keep: a JPEG of at most 1200 px on its long side (about 100-300 KB), which
 * is still sharp enough to read the table. Browsers turn a phone photo the right way up by itself when drawing it
 * (EXIF orientation), so nothing here rotates.
 */

const LONG_SIDE_PX = 1200;
/** The database keeps photos up to 700,000 characters; this leaves room. */
const MAX_CHARS = 650_000;

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('not an image'));
    };
    image.src = url;
  });
}

/** The photo as a JPEG data URL, or an error when the file is not an image the browser can read. */
export async function labelPhotoDataUrl(file: Blob): Promise<string> {
  const image = await loadImage(file);
  const scale = Math.min(1, LONG_SIDE_PX / Math.max(image.naturalWidth, image.naturalHeight, 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no canvas');
  // A transparent picture (a screenshot of a web page) gets a white background, not a black one.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.82, 0.7, 0.55, 0.4]) {
    const data = canvas.toDataURL('image/jpeg', quality);
    if (data.length <= MAX_CHARS) return data;
  }
  throw new Error('photo too large');
}
