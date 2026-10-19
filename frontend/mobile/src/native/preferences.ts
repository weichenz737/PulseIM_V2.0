import { Preferences } from '@capacitor/preferences'

export async function setPreference(key: string, value: string) {
  await Preferences.set({ key, value })
}

export async function getPreference(key: string): Promise<string | null> {
  return (await Preferences.get({ key })).value
}

export async function removePreference(key: string) {
  await Preferences.remove({ key })
}

export async function clearPreferences() {
  await Preferences.clear()
}

export async function getPreferenceKeys(): Promise<string[]> {
  return (await Preferences.keys()).keys
}

export async function setJsonPreference<T>(key: string, value: T) {
  await setPreference(key, JSON.stringify(value))
}

export async function getJsonPreference<T>(key: string): Promise<T | null> {
  const value = await getPreference(key)
  if (value === null) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}
