import { describe, expect, it } from 'vitest'
import { detectPlatform, toEmbed } from '../streams'

describe('toEmbed', () => {
  it('builds the Twitch player with the parent domain', () => {
    expect(toEmbed('https://www.twitch.tv/esports_unsa', 'esports.unsa.edu.pe').src).toBe(
      'https://player.twitch.tv/?channel=esports_unsa&parent=esports.unsa.edu.pe',
    )
  })

  it('builds the Kick player', () => {
    expect(toEmbed('https://kick.com/esports_unsa', 'localhost').src).toBe('https://player.kick.com/esports_unsa')
  })

  it('supports YouTube videos, short links and live URLs', () => {
    expect(toEmbed('https://www.youtube.com/watch?v=abc123', 'x').src).toContain('/embed/abc123')
    expect(toEmbed('https://youtu.be/abc123', 'x').src).toContain('/embed/abc123')
    expect(toEmbed('https://www.youtube.com/live/abc123', 'x').src).toContain('/embed/abc123')
  })

  it('returns no embed for unknown platforms or invalid URLs', () => {
    expect(toEmbed('https://example.com/stream', 'x').src).toBeNull()
    expect(toEmbed('not a url', 'x').src).toBeNull()
  })
})

describe('detectPlatform', () => {
  it('detects the platform from the URL', () => {
    expect(detectPlatform('https://twitch.tv/a')).toBe('twitch')
    expect(detectPlatform('https://kick.com/a')).toBe('kick')
    expect(detectPlatform('https://youtu.be/a')).toBe('youtube')
    expect(detectPlatform('https://example.com')).toBe('other')
  })
})
