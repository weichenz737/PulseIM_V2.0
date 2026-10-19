import { Clipboard } from '@capacitor/clipboard'

export function writeText(text: string) {
  return Clipboard.write({ string: text })
}

export async function readText(): Promise<string> {
  return (await Clipboard.read()).value
}
