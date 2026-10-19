import { Keyboard, KeyboardResize, type KeyboardInfo } from '@capacitor/keyboard'

export { KeyboardResize }

export const showKeyboard = () => Keyboard.show()
export const hideKeyboard = () => Keyboard.hide()
export const setKeyboardResizeMode = (mode: KeyboardResize) => Keyboard.setResizeMode({ mode })
export const setKeyboardScrollEnabled = (isDisabled: boolean) =>
  Keyboard.setScroll({ isDisabled })

export const onKeyboardWillShow = (listener: (info: KeyboardInfo) => void) =>
  Keyboard.addListener('keyboardWillShow', listener)
export const onKeyboardDidShow = (listener: (info: KeyboardInfo) => void) =>
  Keyboard.addListener('keyboardDidShow', listener)
export const onKeyboardWillHide = (listener: () => void) =>
  Keyboard.addListener('keyboardWillHide', listener)
export const onKeyboardDidHide = (listener: () => void) =>
  Keyboard.addListener('keyboardDidHide', listener)
