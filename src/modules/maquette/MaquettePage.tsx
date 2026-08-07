import maquetteHtml from './maquette-ui.html?raw'

export default function MaquettePage() {
  return (
    <div className="w-full">
      <iframe
        title="Maquette UI — Deux Thèmes Dark SaaS/POS"
        srcDoc={maquetteHtml}
        className="w-full border-0 rounded-2xl overflow-hidden"
        style={{ height: 'calc(100vh - 120px)', minHeight: 900, background: '#05060a' }}
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  )
}
