const fs = require('node:fs')
const path = require('node:path')
const sharp = require('../frontend/mobile/node_modules/sharp')

const source = path.resolve(__dirname, '..', 'frontend', 'desktop', 'electron', 'pulse.svg')
const target = path.resolve(__dirname, '..', 'frontend', 'desktop', 'electron', 'pulse.ico')
const sizes = [16, 32, 48, 64, 128, 256]

async function main() {
  const images = await Promise.all(sizes.map((size) => sharp(source).resize(size, size).png().toBuffer()))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const entries = Buffer.alloc(images.length * 16)
  let offset = header.length + entries.length
  images.forEach((image, index) => {
    const entryOffset = index * 16
    const size = sizes[index]
    entries.writeUInt8(size === 256 ? 0 : size, entryOffset)
    entries.writeUInt8(size === 256 ? 0 : size, entryOffset + 1)
    entries.writeUInt8(0, entryOffset + 2)
    entries.writeUInt8(0, entryOffset + 3)
    entries.writeUInt16LE(1, entryOffset + 4)
    entries.writeUInt16LE(32, entryOffset + 6)
    entries.writeUInt32LE(image.length, entryOffset + 8)
    entries.writeUInt32LE(offset, entryOffset + 12)
    offset += image.length
  })
  fs.writeFileSync(target, Buffer.concat([header, entries, ...images]))
  console.log(`Generated ${target}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
