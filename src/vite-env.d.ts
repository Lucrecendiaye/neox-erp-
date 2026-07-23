/// <reference types="vite/client" />

interface BarcodeDetectorOptions {
  formats: string[]
}

interface DetectedBarcode {
  rawValue: string
  format: string
  boundingBox: DOMRectReadOnly
  cornerPoints: readonly DOMPointReadOnly[]
}

declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions)
  static getSupportedFormats(): Promise<string[]>
  detect(image: ImageBitmap | HTMLCanvasElement | HTMLVideoElement | HTMLImageElement | SVGImageElement | OffscreenCanvas | VideoFrame): Promise<DetectedBarcode[]>
}
