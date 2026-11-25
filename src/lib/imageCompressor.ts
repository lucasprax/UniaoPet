/**
 * High-performance client-side image compression using HTML Canvas.
 * Automatically resizes large camera/gallery photos and compresses to JPEG/WebP.
 * Drastically reduces payload from ~5-10MB to ~40-100KB (98% reduction),
 * preventing server database bloat and network transfer lag.
 */

export interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 to 1.0
  mimeType?: 'image/jpeg' | 'image/webp';
}

export async function compressImageFile(
  file: File | Blob,
  options: CompressOptions = {}
): Promise<string> {
  const {
    maxWidth = 1200,
    maxHeight = 1200,
    quality = 0.75,
    mimeType = 'image/jpeg'
  } = options;

  return new Promise((resolve, reject) => {
    // If not an image, reject or return empty
    if (file.type && !file.type.startsWith('image/')) {
      return reject(new Error('O arquivo selecionado não é uma imagem válida.'));
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Erro ao ler arquivo de imagem.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Erro ao processar dados da imagem.'));
      img.onload = () => {
        let { width, height } = img;

        // If image is already within bounds, keep scale, else calculate aspect ratio
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) {
          // Fallback to original raw string if canvas not supported
          return resolve(reader.result as string);
        }

        // Fill background with white in case of transparent PNG converted to JPEG
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw and downscale image smoothly
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        try {
          const compressedDataUrl = canvas.toDataURL(mimeType, quality);
          resolve(compressedDataUrl);
        } catch {
          // Fallback
          resolve(reader.result as string);
        }
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}
