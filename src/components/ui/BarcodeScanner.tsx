import { useEffect, useRef, useState } from 'react'
import { Modal, Button } from '.'
import { Scan, Camera, X } from 'lucide-react'

interface BarcodeScannerProps {
  open: boolean
  onClose: () => void
  onScan: (code: string) => void
}

export default function BarcodeScanner({ open, onClose, onScan }: BarcodeScannerProps) {
  const [mode, setMode] = useState<'camera' | 'manual'>('camera')
  const [manualCode, setManualCode] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectorRef = useRef<BarcodeDetector | null>(null)
  const scanTimerRef = useRef<number>(0)

  useEffect(() => {
    if (!open) {
      stopCamera()
      setManualCode('')
      setMode('camera')
      return
    }
  }, [open])

  async function startCamera() {
    if (!('BarcodeDetector' in window)) {
      setMode('manual')
      return
    }
    try {
      detectorRef.current = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e'] })
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 640, height: 480 } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      scanLoop()
    } catch {
      setMode('manual')
    }
  }

  function scanLoop() {
    if (!videoRef.current || !detectorRef.current) return
    scanTimerRef.current = window.setTimeout(async () => {
      try {
        const codes = await detectorRef.current!.detect(videoRef.current!)
        if (codes.length > 0) {
          onScan(codes[0].rawValue)
          stopCamera()
          onClose()
          return
        }
      } catch {}
      scanLoop()
    }, 300)
  }

  function stopCamera() {
    clearTimeout(scanTimerRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }
    streamRef.current = null
    detectorRef.current = null
  }

  function handleManualSubmit() {
    if (manualCode.trim()) {
      onScan(manualCode.trim())
      onClose()
      setManualCode('')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Scanner un code-barres" size="sm">
      <div className="p-6 space-y-4">
        {mode === 'camera' ? (
          <div>
            <div className="relative bg-black rounded-xl overflow-hidden h-64 flex items-center justify-center">
              <video ref={videoRef} className="w-full h-full object-cover" onPlay={() => {}} onCanPlay={startCamera} />
              <div className="absolute inset-0 border-2 border-primary-400/50 rounded-xl m-8" />
              <Scan className="absolute text-white/30 w-12 h-12 animate-pulse" />
            </div>
            <p className="text-xs text-surface-400 text-center mt-2">Placez le code-barres dans le cadre</p>
            <Button variant="ghost" size="sm" className="w-full mt-2" onClick={() => { stopCamera(); setMode('manual') }}>
              <X className="w-4 h-4" /> Saisir manuellement
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-surface-50 rounded-xl p-4 text-center">
              <Camera className="w-8 h-8 text-surface-300 mx-auto mb-2" />
              <p className="text-sm text-surface-500">Saisissez le code-barres</p>
            </div>
            <input
              type="text" value={manualCode} autoFocus
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
              placeholder="Code-barres..."
              className="w-full rounded-xl border border-surface-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <Button className="w-full" onClick={handleManualSubmit} disabled={!manualCode.trim()}>
              <Scan className="w-4 h-4" /> Valider
            </Button>
            {'BarcodeDetector' in window && (
              <Button variant="ghost" size="sm" className="w-full" onClick={() => { setMode('camera'); startCamera() }}>
                <Camera className="w-4 h-4" /> Utiliser la caméra
              </Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
