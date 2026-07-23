import { useState, useCallback, useRef } from 'react'

interface BarcodeResult {
  code: string
  format: string
}

export function useBarcodeScanner() {
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<BarcodeResult | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectorRef = useRef<BarcodeDetector | null>(null)

  const startScanning = useCallback(async () => {
    setError(null)
    setScanning(true)

    try {
      if ('BarcodeDetector' in window) {
        detectorRef.current = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e'] })
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 640, height: 480 },
      })
      streamRef.current = stream

      const video = document.createElement('video')
      video.srcObject = stream
      video.setAttribute('playsinline', '')
      video.play()
      videoRef.current = video

      return { video, stream }
    } catch (err) {
      setError('Appareil photo non accessible')
      setScanning(false)
      return null
    }
  }, [])

  const scanFrame = useCallback(async (): Promise<BarcodeResult | null> => {
    const video = videoRef.current
    if (!video || !detectorRef.current) return null

    try {
      const codes = await detectorRef.current.detect(video)
      if (codes.length > 0) {
        const result = { code: codes[0].rawValue, format: codes[0].format }
        setLastResult(result)
        return result
      }
    } catch {
      // Frame error
    }
    return null
  }, [])

  const stopScanning = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
    }
    videoRef.current = null
    streamRef.current = null
    detectorRef.current = null
    setScanning(false)
    setLastResult(null)
  }, [])

  return { scanning, error, lastResult, startScanning, stopScanning, scanFrame }
}
