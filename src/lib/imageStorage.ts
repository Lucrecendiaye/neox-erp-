import { isSupabaseConfigured, supabase } from './supabase'

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || ''
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || ''

export const IMAGE_BUCKET = 'erp-images'
const MAX_DIM = 900
const JPEG_QUALITY = 0.72

export function isExternalPhoto(photo: string): boolean {
  return photo.startsWith('http://') || photo.startsWith('https://')
}

export function isDataUrl(photo: string): boolean {
  return photo.startsWith('data:')
}

export function isCloudinaryConfigured(): boolean {
  return !!(CLOUD_NAME && UPLOAD_PRESET)
}

function createImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image invalide'))
    img.src = dataUrl
  })
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, base64] = dataUrl.split(',')
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function dataUrlToFile(dataUrl: string, name: string): File {
  const blob = dataUrlToBlob(dataUrl)
  const mime = blob.type || 'image/jpeg'
  const ext = mime.split('/')[1] || 'jpg'
  return new File([blob], `${name}.${ext}`, { type: mime })
}

export async function compressImage(
  file: File,
  opts?: { maxDim?: number; quality?: number; format?: 'jpeg' | 'png' }
): Promise<string> {
  const maxDim = opts?.maxDim || MAX_DIM
  const quality = opts?.quality || JPEG_QUALITY
  const format = opts?.format || (file.type === 'image/png' ? 'png' : 'jpeg')

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'))
    reader.readAsDataURL(file)
  })

  const img = await createImage(dataUrl)
  let { width, height } = img
  if (width > maxDim || height > maxDim) {
    const scale = Math.min(maxDim / width, maxDim / height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  if (format === 'jpeg') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
  }
  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL(format === 'png' ? 'image/png' : 'image/jpeg', quality)
}

async function uploadToCloudinary(dataUrl: string, folder: string): Promise<string | null> {
  if (!isCloudinaryConfigured()) return null
  try {
    const formData = new FormData()
    formData.append('file', dataUrlToFile(dataUrl, 'img'))
    formData.append('upload_preset', UPLOAD_PRESET)
    formData.append('folder', folder)
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.secure_url || null
  } catch {
    return null
  }
}

async function uploadToSupabaseStorage(dataUrl: string, folder: string): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase) return null
  try {
    const file = dataUrlToFile(dataUrl, `img-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const { data, error } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(`${folder}/${file.name}`, file, { contentType: file.type, upsert: false })
    if (error) return null
    const { data: urlData } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(data.path)
    return urlData?.publicUrl || null
  } catch {
    return null
  }
}

/**
 * Envoie une image (data URL) vers un stockage externe.
 * Retourne l'URL externe, ou la data URL compressée en fallback si aucun stockage n'est configuré.
 */
export async function uploadImage(dataUrl: string, folder: string = 'products'): Promise<string> {
  if (!isDataUrl(dataUrl)) return dataUrl
  const url = await uploadToCloudinary(dataUrl, folder) || await uploadToSupabaseStorage(dataUrl, folder)
  return url || dataUrl
}

/**
 * Prépare un objet avant envoi à Supabase :
 * toute photo encore en data URL est téléversée vers un stockage externe.
 * Si le téléversement échoue, la photo est retirée pour ne jamais remplir la base.
 */
export async function sanitizePayloadForSync(data: Record<string, any>): Promise<Record<string, any>> {
  if (!data || !Array.isArray(data.photos)) return data
  const sanitized = { ...data, photos: [] as string[] }
  for (const photo of data.photos) {
    if (isExternalPhoto(photo)) {
      sanitized.photos.push(photo)
    } else if (isDataUrl(photo)) {
      const url = await uploadToCloudinary(photo, 'products') || await uploadToSupabaseStorage(photo, 'products')
      if (url) sanitized.photos.push(url)
    }
  }
  return sanitized
}
