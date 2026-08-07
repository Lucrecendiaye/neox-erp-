import { toast } from '@/lib/toast'

export function openEmail(to: string, subject: string, body: string) {
  window.open(`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank')
  toast('Email ouvert', 'success')
}

export function openWhatsAppLink(phone: string, message: string) {
  const clean = phone.replace(/[^0-9]/g, '')
  if (clean) {
    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(message)}`, '_blank')
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')
  }
  toast('WhatsApp ouvert', 'success')
}

export function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {})
  }
}

export function shareViaWeChat(text: string, title?: string) {
  if (navigator.share) {
    navigator.share({ title, text }).catch(() => {
      copyText(text)
      toast('Texte copié — collez-le dans WeChat', 'info')
    })
    return
  }
  copyText(text)
  toast('Texte copié — collez-le dans WeChat', 'info')
}

export async function shareFileNative(fileName: string, blob: Blob, title?: string) {
  const file = new File([blob], fileName, { type: 'application/pdf' })
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title }).catch(() => {})
  } else {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }
}
