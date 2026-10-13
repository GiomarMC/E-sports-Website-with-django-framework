import type { Platform } from './types'

export interface EmbedInfo {
  src: string | null
  platform: Platform
}

/** Guesses the platform from a URL. */
export function detectPlatform(url: string): Platform {
  const host = safeHost(url)
  if (host.includes('twitch.tv')) return 'twitch'
  if (host.includes('youtube.com') || host === 'youtu.be') return 'youtube'
  if (host.includes('kick.com')) return 'kick'
  if (host.includes('facebook.com') || host.includes('fb.watch')) return 'facebook'
  if (host.includes('tiktok.com')) return 'tiktok'
  return 'other'
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/**
 * Converts a channel / video URL into an embeddable player URL.
 * Returns src = null when the platform cannot be embedded (link only).
 * ``parentHost`` is required by Twitch (the domain that embeds the player).
 */
export function toEmbed(url: string, parentHost: string): EmbedInfo {
  const platform = detectPlatform(url)
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { src: null, platform }
  }
  const parts = parsed.pathname.split('/').filter(Boolean)

  if (platform === 'twitch') {
    const parent = encodeURIComponent(parentHost)
    if (parts[0] === 'videos' && parts[1]) {
      return { platform, src: `https://player.twitch.tv/?video=${parts[1]}&parent=${parent}` }
    }
    if (parts[0]) {
      return { platform, src: `https://player.twitch.tv/?channel=${parts[0]}&parent=${parent}` }
    }
  }

  if (platform === 'kick' && parts[0]) {
    return { platform, src: `https://player.kick.com/${parts[0]}` }
  }

  if (platform === 'youtube') {
    const videoId =
      parsed.hostname === 'youtu.be'
        ? parts[0]
        : parsed.searchParams.get('v') ?? (['live', 'embed', 'shorts'].includes(parts[0]) ? parts[1] : null)
    if (videoId) return { platform, src: `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1` }
    const channel = parts[0] === 'channel' ? parts[1] : null
    if (channel) {
      return { platform, src: `https://www.youtube.com/embed/live_stream?channel=${channel}&autoplay=1&mute=1` }
    }
  }

  if (platform === 'facebook') {
    return {
      platform,
      src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`,
    }
  }

  return { src: null, platform }
}
