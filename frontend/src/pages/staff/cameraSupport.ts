type Detector = { detect(source: ImageBitmapSource): Promise<{ rawValue?: string }[]> };
type DetectorConstructor = new (options?: { formats?: string[] }) => Detector;

export function detectorConstructor() {
  return (window as Window & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
}

export function canReadQrFromCamera() {
  return !!detectorConstructor() && !!navigator.mediaDevices?.getUserMedia;
}

export type ImageDecodeFailure = 'unsupported' | 'none';

/** Reads one QR code from an image file; rejects with an ImageDecodeFailure. */
export async function decodeQrFromImage(file: File) {
  const Constructor = detectorConstructor();
  if (!Constructor) throw 'unsupported' satisfies ImageDecodeFailure;
  const image = await createImageBitmap(file);
  try {
    const results = await new Constructor({ formats: ['qr_code'] }).detect(image);
    const value = results.find((result) => result.rawValue)?.rawValue?.trim();
    if (!value) throw 'none' satisfies ImageDecodeFailure;
    return value;
  } finally {
    image.close();
  }
}
