/**
 * Photos of notes for LabBot, shrunk in the browser before they are sent.
 *
 * A phone photo is 3 to 12 MB. The model reads nothing more from it above
 * about 1,600 pixels on the long side, so sending the original would only
 * make a lab on a slow connection wait. Shrinking here also drops the
 * location and camera details a phone writes into the file.
 */

export const MAX_PHOTOS = 3;
const LONG_EDGE = 1568;

export type Photo = { mediaType: 'image/jpeg'; data: string; preview: string; name: string };

export class PhotoError extends Error {}

export async function shrinkPhoto(file: File): Promise<Photo> {
  if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
    throw new PhotoError(`${file.name} is not a picture.`);
  }
  let bitmap: ImageBitmap;
  try {
    // Honours the phone's rotation, so a portrait page is not read sideways.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoError(
      `${file.name} could not be opened in this browser. Take a screenshot of it, or save it as a JPEG, and attach that.`,
    );
  }
  const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new PhotoError('This browser cannot prepare pictures. Try another browser.');
  // A transparent PNG would otherwise turn black as a JPEG.
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const preview = canvas.toDataURL('image/jpeg', 0.85);
  return { mediaType: 'image/jpeg', data: preview.slice(preview.indexOf(',') + 1), preview, name: file.name };
}
