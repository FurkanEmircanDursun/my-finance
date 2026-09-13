import { isNative } from './index'

/**
 * The small physical answer a phone gives when something committed.
 *
 * Every modern banking app taps back when you switch tab, dismiss a sheet or
 * confirm a payment, and the absence of it is one of the things that makes a
 * WebView feel like a web page rather than an app. It is doing one job: telling
 * the finger that the tap landed, before the eye has read the new screen.
 *
 * Implemented on `navigator.vibrate` rather than a Capacitor plugin. The
 * durations here are the short end of the scale on purpose — anything a person
 * can consciously feel as "buzzing" is too long for feedback and reads as an
 * alert instead.
 *
 * Native only. A desktop browser either ignores `vibrate` or, on the handful
 * that implement it, would buzz a phone-shaped notification for a mouse click.
 */

type Pattern = number | number[]

function fire(pattern: Pattern): void {
  if (!isNative()) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Vibration is a courtesy. A device that refuses it (permission stripped,
    // hardware absent, battery saver) must never take an interaction with it.
  }
}

/** Selection changed: a tab, a period, a category. */
export function hapticTap(): void {
  fire(8)
}

/** Something opened or closed under a gesture — a sheet dismissed by a drag. */
export function hapticImpact(): void {
  fire(14)
}

/** A destructive or irreversible action landed. Two beats, so it is not a tap. */
export function hapticWarn(): void {
  fire([12, 40, 12])
}
