// Translate raw API / fetch errors into something a user can read.
// openapi-fetch surfaces failed responses as `{ status, message?, ... }`-shaped
// objects on the `error` channel; thrown errors come as `Error` instances.
// This helper covers both paths plus a small set of well-known status codes
// from the device.

const STATUS_MESSAGES: Record<number, string> = {
  400: "The display didn't like that request.",
  404: "That doesn't exist on the display anymore.",
  408: 'The display took too long to respond.',
  409: 'That conflicts with the current state.',
  413: 'That file is too large.',
  423: 'Quiet hours are blocking this — try again outside quiet hours.',
  500: 'Something went wrong on the display.',
}

export function friendlyError(e: unknown, fallback = 'Unknown error'): string {
  if (e == null) return fallback
  if (typeof e === 'string') return e

  if (e instanceof Error) {
    // Network errors from fetch typically look like "Failed to fetch" / "Load failed"
    if (/^(failed to fetch|load failed|networkerror)/i.test(e.message)) {
      return "Couldn't reach the display. Check the connection."
    }
    return e.message
  }

  const obj = e as {
    status?: number
    message?: string
    error?: string
    detail?: string
  }
  if (typeof obj.status === 'number' && STATUS_MESSAGES[obj.status]) {
    return STATUS_MESSAGES[obj.status]
  }
  return obj.detail ?? obj.error ?? obj.message ?? fallback
}
