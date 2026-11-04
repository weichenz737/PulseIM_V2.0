/** Keep a touch on a text field attached to that field while the IME resizes
 * the WebView. Chat and comments own their specialised composer guards. */
export function installInputFocusGuard() {
  type Field = HTMLInputElement | HTMLTextAreaElement
  const textTypes = new Set(['text', 'password', 'search', 'tel', 'email', 'url', 'number'])
  const wired = new WeakSet<Field>()
  let intent: { field: Field; rect: DOMRect; until: number; height: number; pointerId?: number } | null = null

  function fieldOf(target: EventTarget | null): Field | null {
    if (!(target instanceof HTMLElement) || target.closest('.chat-page, .comment-composer')) return null
    if (target instanceof HTMLTextAreaElement) return target.disabled || target.readOnly ? null : target
    if (target instanceof HTMLInputElement && textTypes.has(target.type) && !target.disabled && !target.readOnly) return target
    return null
  }
  function recover() {
    const current = intent
    if (!current || Date.now() > current.until || !current.field.isConnected) return
    if (document.activeElement === document.body || document.activeElement === document.documentElement) {
      current.field.focus({ preventScroll: true })
    }
  }
  function remember(field: Field, pointerId?: number) {
    if (!wired.has(field)) {
      // Text fields must not activate a surrounding navigable row.
      field.addEventListener('click', event => event.stopPropagation())
      wired.add(field)
    }
    if (intent?.field === field && Date.now() < intent.until) {
      intent.until = Date.now() + 700
      if (pointerId !== undefined) intent.pointerId = pointerId
    } else {
      intent = { field, rect: field.getBoundingClientRect(), until: Date.now() + 700, height: window.innerHeight, pointerId }
    }
  }
  function guardOldPosition(event: MouseEvent) {
    const current = intent
    if (!current || Date.now() > current.until || fieldOf(event.target)) return false
    const rect = current.field.getBoundingClientRect()
    const moved = Math.abs(rect.y - current.rect.y) > 8 || Math.abs(window.innerHeight - current.height) > 40
    const insideOldField = event.clientX >= current.rect.left && event.clientX <= current.rect.right
      && event.clientY >= current.rect.top && event.clientY <= current.rect.bottom
    if (!moved || !insideOldField) return false
    event.preventDefault()
    event.stopImmediatePropagation()
    current.field.focus({ preventScroll: true })
    return true
  }
  document.addEventListener('pointerdown', event => {
    const field = fieldOf(event.target)
    if (field && event.pointerType === 'touch') {
      remember(field, event.pointerId)
      try { field.setPointerCapture(event.pointerId) } catch { /* detached field */ }
    } else if (!guardOldPosition(event)) {
      // A deliberate tap elsewhere or on another specialised composer ends
      // recovery, so normal focus changes and submission continue to work.
      intent = null
    }
  }, true)
  document.addEventListener('pointerup', event => {
    if (!intent || intent.pointerId !== event.pointerId) return
    const moved = Math.abs(intent.field.getBoundingClientRect().y - intent.rect.y) > 8
      || Math.abs(window.innerHeight - intent.height) > 40
    if (moved) {
      event.preventDefault()
      intent.field.focus({ preventScroll: true })
    }
    intent.pointerId = undefined
  }, true)
  document.addEventListener('pointercancel', () => { intent = null }, true)
  document.addEventListener('click', guardOldPosition, true)
  document.addEventListener('focusin', event => {
    const field = fieldOf(event.target)
    if (field) remember(field)
  }, true)
  document.addEventListener('focusout', () => requestAnimationFrame(recover), true)
  window.addEventListener('pulse:native-keyboard-settled', event => {
    if ((event as CustomEvent<{ visible: boolean }>).detail?.visible === false) intent = null
    else recover()
  })
}
