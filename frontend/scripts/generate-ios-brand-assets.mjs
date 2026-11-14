import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

// Reuse the current code-native Mizan mark. Android and the web use this same M.
const source = readFileSync(new URL('../public/favicon.svg', import.meta.url))
const iconFolder = new URL('../ios/App/App/Assets.xcassets/AppIcon.appiconset/', import.meta.url)
const splashFolder = new URL('../ios/App/App/Assets.xcassets/Splash.imageset/', import.meta.url)
await sharp(source).resize(1024, 1024).flatten({ background: '#7161d8' }).removeAlpha().png().toFile(fileURLToPath(new URL('Mizan-AppIcon-1024.png', iconFolder)))
writeFileSync(new URL('Contents.json', iconFolder), JSON.stringify({ images: [{ filename: 'Mizan-AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { author: 'xcode', version: 1 } }, null, 2) + '\n')
const images = []
for (const scale of [1, 2, 3]) {
  const filename = `mizan-splash${scale === 1 ? '' : `@${scale}x`}.png`
  await sharp(source).resize(80 * scale, 80 * scale).png().toFile(fileURLToPath(new URL(filename, splashFolder)))
  images.push({ filename, idiom: 'universal', scale: `${scale}x` })
}
writeFileSync(new URL('Contents.json', splashFolder), JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2) + '\n')
// Remove only the known generated Capacitor template files.
rmSync(new URL('AppIcon-512@2x.png', iconFolder), { force: true })
for (const filename of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) rmSync(new URL(filename, splashFolder), { force: true })
const metadata = await sharp(fileURLToPath(new URL('Mizan-AppIcon-1024.png', iconFolder))).metadata()
if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('iOS app icon must be 1024×1024 and opaque')
console.log('Generated the opaque Mizan iOS icon and 80-point launch mark at 1×/2×/3× from public/favicon.svg.')
