import { useState, useRef } from 'react'
import { Camera, X, Loader2, ImagePlus } from 'lucide-react'
import { compressImage, uploadImage } from '@/lib/imageStorage'

interface PhotoUploadProps {
  photos: string[]
  onChange: (photos: string[]) => void
  max?: number
}

export default function PhotoUpload({ photos, onChange, max = 5 }: PhotoUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [replaceMain, setReplaceMain] = useState(false)

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return
    const compressed = await compressImage(file)
    const url = await uploadImage(compressed)
    return url
  }

  async function handleFiles(files: FileList | File[]) {
    setUploading(true)
    try {
      const list = Array.from(files).filter(f => f.type.startsWith('image/'))
      const urls: string[] = []
      for (const file of list) {
        if (replaceMain && urls.length === 0) {
          const url = await handleFile(file)
          if (url) urls.push(url)
        } else if (photos.length + urls.length < max) {
          const url = await handleFile(file)
          if (url) urls.push(url)
        }
      }
      if (urls.length > 0) {
        if (replaceMain) {
          onChange([...urls, ...photos.slice(1)].slice(0, max))
        } else {
          onChange([...photos, ...urls].slice(0, max))
        }
      }
    } catch {
      // image ignorée
    } finally {
      setUploading(false)
      setReplaceMain(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files)
  }

  function openPicker(replace: boolean) {
    setReplaceMain(replace)
    fileRef.current?.click()
  }

  function removePhoto(index: number) {
    onChange(photos.filter((_, i) => i !== index))
  }

  const mainPhoto = photos[0]

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-surface-700">Photo du produit</label>

      {mainPhoto ? (
        <div className="flex items-start gap-5">
          <div className="relative w-[110px] h-[110px] rounded-xl border border-surface-200 bg-surface-50 overflow-hidden shrink-0 flex items-center justify-center">
            <img src={mainPhoto} alt="" className="w-full h-full object-contain" />
            {photos.length > 1 && (
              <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-black/60 text-[10px] font-semibold text-white">
                +{photos.length - 1}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <button
              type="button"
              onClick={() => openPicker(true)}
              disabled={uploading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-surface-300 text-sm font-medium text-surface-700 hover:border-primary-300 hover:text-primary-600 hover:bg-surface-50 transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              Changer
            </button>
            <div className="flex flex-wrap gap-2">
              {photos.map((photo, idx) => (
                <div key={idx} className="relative w-12 h-12 rounded-lg overflow-hidden border border-surface-200 group">
                  <img src={photo} alt="" className="w-full h-full object-contain bg-surface-50" />
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
              {photos.length < max && (
                <button
                  type="button"
                  onClick={() => openPicker(false)}
                  className="w-12 h-12 rounded-lg border-2 border-dashed border-surface-300 hover:border-primary-400 hover:bg-surface-50 flex items-center justify-center text-surface-400 transition-colors"
                  title="Ajouter une photo"
                >
                  <ImagePlus className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => openPicker(false)}
          className={`w-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 py-10 cursor-pointer transition-colors ${
            dragOver ? 'border-primary-500 bg-primary-50' : 'border-surface-300 hover:border-primary-400 hover:bg-surface-50'
          } ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
        >
          {uploading ? (
            <Loader2 className="w-6 h-6 text-surface-400 animate-spin" />
          ) : (
            <>
              <Camera className="w-6 h-6 text-surface-400" />
              <span className="text-sm text-surface-500 font-medium">Cliquez pour ajouter une photo</span>
              <span className="text-xs text-surface-400">ou glissez-déposez une image (max {max})</span>
            </>
          )}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files) { handleFiles(e.target.files); e.target.value = '' } }}
      />
    </div>
  )
}
