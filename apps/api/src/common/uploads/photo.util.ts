import sharp from 'sharp';

/**
 * v030.C — portrait photos are still stored inline as data URIs, but no
 * longer at whatever size they were uploaded:
 *   * `full`  — at most 512 px on the long side (JPEG), for the profile page;
 *   * `thumb` — a 128 px square (JPEG), for every list, tile and avatar.
 * A 3 MB phone photo becomes roughly 40 KB + 5 KB, so staff lists no longer
 * ship megabytes of image data on every load.
 */
export const PHOTO_FULL_PX = 512;
export const PHOTO_THUMB_PX = 128;
/** A stored photo bigger than this (characters of data URI) is re-shrunk. */
export const PHOTO_FULL_MAX_CHARS = 150_000;

export interface ProcessedPhoto {
  full: string;
  thumb: string;
}

function toJpegDataUri(buf: Buffer) {
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

/** Decodes a `data:<mime>;base64,<...>` URI; null when it isn't one. */
export function dataUriToBuffer(uri: string): Buffer | null {
  const m = /^data:[^;,]+;base64,(.+)$/s.exec(uri);
  if (!m) return null;
  try {
    return Buffer.from(m[1], 'base64');
  } catch {
    return null;
  }
}

/** Shrinks an uploaded image into the stored full photo and its thumbnail.
 *  Honours the camera's rotation flag; transparent areas become white. */
export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  const base = sharp(input, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' });
  const [full, thumb] = await Promise.all([
    base.clone().resize(PHOTO_FULL_PX, PHOTO_FULL_PX, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer(),
    base.clone().resize(PHOTO_THUMB_PX, PHOTO_THUMB_PX, { fit: 'cover', position: 'attention' }).jpeg({ quality: 74, mozjpeg: true }).toBuffer(),
  ]);
  return { full: toJpegDataUri(full), thumb: toJpegDataUri(thumb) };
}

/** For a `photoUrl` value coming from a form or an upload: a data URI is
 *  processed; a plain URL is kept as both; empty clears both. An image
 *  sharp can't read is kept as it is (thumbnail = the same image). */
export async function photoColumns(photoUrl: string | null | undefined): Promise<{ photoUrl: string | null; photoThumb: string | null }> {
  if (!photoUrl) return { photoUrl: null, photoThumb: null };
  const buf = dataUriToBuffer(photoUrl);
  if (!buf) return { photoUrl, photoThumb: photoUrl };
  try {
    const p = await processPhoto(buf);
    return { photoUrl: p.full, photoThumb: p.thumb };
  } catch {
    return { photoUrl, photoThumb: photoUrl };
  }
}
