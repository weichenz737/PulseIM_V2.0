import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useRegisterStore = defineStore('register', () => {
  const phone = ref('')
  const code = ref('')
  const nickname = ref('')
  const password = ref('')
  const avatar = ref('')
  const avatarFile = ref<File | null>(null)

  function reset() {
    phone.value = ''
    code.value = ''
    nickname.value = ''
    password.value = ''
    avatar.value = ''
    avatarFile.value = null
  }

  function setPhone(value: string) {
    phone.value = value
  }

  function setCode(value: string) {
    code.value = value
  }

  function setProfile(nick: string, pwd: string) {
    nickname.value = nick
    password.value = pwd
  }

  function setAvatar(dataUrl: string, file?: File | null) {
    avatar.value = dataUrl
    avatarFile.value = file ?? null
  }

  return {
    phone,
    code,
    nickname,
    password,
    avatar,
    avatarFile,
    reset,
    setPhone,
    setCode,
    setProfile,
    setAvatar,
  }
})
