import sharp from 'sharp'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../public/icons')

const sizes = [192, 512, 180, 152, 144, 120, 76, 72, 60, 48, 36, 96]
const bg = '#7C3AED' // primary-600
const textColor = '#FFFFFF'

async function generateIcon(size) {
  const svgText = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="${bg}"/>
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" 
          font-family="system-ui, sans-serif" font-weight="bold" 
          font-size="${size * 0.55}px" fill="${textColor}">N</text>
  </svg>`

  return sharp(Buffer.from(svgText))
    .resize(size, size)
    .png()
    .toFile(path.join(outDir, `icon-${size}.png`))
}

async function main() {
  console.log('Generating PWA icons...')
  for (const size of sizes) {
    await generateIcon(size)
    console.log(`  ✓ icon-${size}.png`)
  }
  console.log('Done!')
}

main().catch(console.error)
