import { useState, useRef } from 'react'
import { Camera, Image, X } from 'lucide-react'

interface PhotoUploadProps {
  photos: string[]
  onChange: (photos: string[]) => void
  max?: number
}

export default function PhotoUpload({ photos, onChange, max = 5 }: PhotoUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      if (dataUrl && photos.length < max) {
        onChange([...photos, dataUrl])
      }
    }
    reader.readAsDataURL(file)
  }

  function handleFiles(files: FileList) {
    for (const file of Array.from(files)) {
      if (photos.length >= max) break
      handleFile(file)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files)
  }

  function removePhoto(index: number) {
    onChange(photos.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-surface-700">Photos</label>
      <div className="flex flex-wrap gap-2">
        {photos.map((photo, idx) => (
          <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-surface-200 group">
            <img src={photo} alt="" className="w-full h-full object-cover" />
            <button
              onClick={() => removePhoto(idx)}
              className="absolute top-1 right-1 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {photos.length < max && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`w-20 h-20 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
              dragOver ? 'border-primary-500 bg-primary-50' : 'border-surface-300 hover:border-primary-400 hover:bg-surface-50'
            }`}
          >
            <Camera className="w-5 h-5 text-surface-400" />
            <span className="text-[10px] text-surface-400">{photos.length}/{max}</span>
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
      <p className="text-xs text-surface-400">Cliquez pour ajouter ou glissez-déposez des images</p>
    </div>
  )
}
