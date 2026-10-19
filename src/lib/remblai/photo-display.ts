// Keep read URLs separate from canonical private dossier references.
export function photoDisplayUrl(photo: { preview: string; signedUrl?: unknown }): string | null {
  if (photo.preview.startsWith('private:')) {
    if (typeof photo.signedUrl !== 'string') return null;
    try {
      const url = new URL(photo.signedUrl);
      return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) ? photo.signedUrl : null;
    } catch { return null; }
  }
  return /^data:image\/(jpeg|png|webp);base64,/.test(photo.preview) ? photo.preview : null;
}
