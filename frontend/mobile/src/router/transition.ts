import { ref } from 'vue'

export type RouteTransitionDirection = 'forward' | 'back'

export const routeTransitionDirection = ref<RouteTransitionDirection>('forward')
let explicitBackPending = false

export function markRouteTransitionBack() {
  routeTransitionDirection.value = 'back'
  explicitBackPending = true
}

export function markRouteTransitionForward() {
  routeTransitionDirection.value = 'forward'
}

export function consumeExplicitBackTransition() {
  const pending = explicitBackPending
  explicitBackPending = false
  return pending
}
