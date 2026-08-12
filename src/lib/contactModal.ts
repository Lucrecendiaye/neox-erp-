export interface ManualContact {
  name: string
  tel: string
}

const STORAGE_KEY = 'neox-contact-fallback'

export function canUseContactPicker(): boolean {
  return typeof navigator !== 'undefined'
    && 'contacts' in navigator
    && typeof (navigator as any).contacts?.select === 'function'
}

export async function pickNativeContact(): Promise<ManualContact | null> {
  if (!canUseContactPicker()) return null
  try {
    const contacts = await (navigator as any).contacts.select(['name', 'tel'] as const, { multiple: false } as const)
    if (contacts && contacts.length > 0) {
      const c = contacts[0]
      return { name: c.name?.[0] || '', tel: c.tel?.[0]?.replace(/[^0-9+]/g, '') || '' }
    }
    return null
  } catch (e) {
    console.warn('Contact picker error:', e)
    return null
  }
}

export function promptContactManual(): Promise<ManualContact | null> {
  return new Promise((resolve) => {
    const saved = loadSaved()
    const overlay = document.createElement('div')
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:9999',
      'background:rgba(0,0,0,.55)', 'backdrop-filter:blur(4px)',
      'display:flex', 'align-items:center', 'justify-content:center', 'padding:20px',
    ].join(';')

    const box = document.createElement('div')
    box.style.cssText = [
      'background:#fff', 'border-radius:18px', 'width:100%', 'max-width:380px',
      'padding:24px', 'box-shadow:0 20px 60px rgba(0,0,0,.3)',
    ].join(';')

    const title = document.createElement('h3')
    title.textContent = 'Contact'
    title.style.cssText = 'margin:0 0 4px;font-size:18px;font-weight:700;color:#111'

    const sub = document.createElement('p')
    sub.textContent = "Votre navigateur ne permet pas l'accès aux contacts. Saisissez-les manuellement."
    sub.style.cssText = 'margin:0 0 16px;font-size:13px;color:#666'

    const labelName = document.createElement('label')
    labelName.textContent = 'Nom'
    labelName.style.cssText = 'display:block;font-size:12px;font-weight:600;color:#333;margin:10px 0 4px'
    const inputName = document.createElement('input')
    inputName.type = 'text'
    inputName.placeholder = 'Nom du contact'
    inputName.value = saved?.name || ''
    inputName.style.cssText = 'width:100%;padding:10px 12px;border:1px solid #ccc;border-radius:10px;font-size:15px;box-sizing:border-box'

    const labelTel = document.createElement('label')
    labelTel.textContent = 'Téléphone'
    labelTel.style.cssText = 'display:block;font-size:12px;font-weight:600;color:#333;margin:10px 0 4px'
    const inputTel = document.createElement('input')
    inputTel.type = 'tel'
    inputTel.inputMode = 'tel'
    inputTel.placeholder = '+226 ...'
    inputTel.value = saved?.tel || ''
    inputTel.style.cssText = 'width:100%;padding:10px 12px;border:1px solid #ccc;border-radius:10px;font-size:15px;box-sizing:border-box'

    const buttons = document.createElement('div')
    buttons.style.cssText = 'display:flex;gap:10px;margin-top:18px'

    const cancel = document.createElement('button')
    cancel.textContent = 'Annuler'
    cancel.style.cssText = btnBase('#666')
    const ok = document.createElement('button')
    ok.textContent = 'Valider'
    ok.style.cssText = btnBase('#2563eb') + ';color:#fff'

    function btnBase(color: string) {
      return `flex:1;padding:11px 0;border:none;border-radius:10px;font-size:14px;font-weight:600;background:${color === '#fff' ? '#eee' : 'transparent'};color:${color};cursor:pointer`
    }

    function done(value: ManualContact | null) {
      if (value) save(value)
      document.removeEventListener('keydown', onKey)
      document.body.removeChild(overlay)
      resolve(value)
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') done(null)
      if (e.key === 'Enter') {
        e.preventDefault()
        done({ name: inputName.value.trim(), tel: inputTel.value.trim() })
      }
    }

    cancel.onclick = () => done(null)
    ok.onclick = () => done({ name: inputName.value.trim(), tel: inputTel.value.trim() })

    buttons.appendChild(cancel)
    buttons.appendChild(ok)
    box.appendChild(title)
    box.appendChild(sub)
    box.appendChild(labelName)
    box.appendChild(inputName)
    box.appendChild(labelTel)
    box.appendChild(inputTel)
    box.appendChild(buttons)
    overlay.appendChild(box)
    document.body.appendChild(overlay)

    setTimeout(() => inputName.focus(), 50)
    document.addEventListener('keydown', onKey)
  })
}

function loadSaved(): ManualContact | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function save(c: ManualContact) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
  } catch {
    /* ignore */
  }
}
