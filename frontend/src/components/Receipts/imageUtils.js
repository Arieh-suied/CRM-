import { authFetch } from '../../services/api.js';

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export function compressImage(file, maxDim = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('שגיאה בטעינת התמונה'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('שגיאה בקריאת הקובץ'));
    reader.readAsDataURL(file);
  });
}

export async function analyzeTransferScreenshot(file) {
  const dataUrl = await compressImage(file);
  const res = await authFetch('/api/parse-transfer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: dataUrl, mimeType: 'image/jpeg' }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'שגיאה בניתוח התמונה');
  return { ...data, _preview: dataUrl };
}
