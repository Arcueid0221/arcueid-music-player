import type { Song } from '../domain/types'

export const demoPlaylist: Song[] = [
  {
    id: 'a-love-song',
    title: 'a love song',
    artist: "EGO-WRAPPIN'",
    album: "Best Wrappin' 1996–2008",
    src: '/audio/a-love-song.mp3',
    lyricsUrl: '/lrc/a-love-song.lrc',
  },
  {
    id: 'keshounaoshi',
    title: '化粧直し',
    artist: '東京事変',
    album: '大人',
    src: '/audio/化粧直し.mp3',
    lyricsUrl: '/lrc/化粧直し.lrc',
  },
  {
    id: 'steal-a-kiss',
    title: 'Steal A Kiss',
    artist: '林忆莲',
    album: 'Open Up',
    src: '/audio/Steal-A-Kiss.mp3',
    lyricsUrl: '/lrc/Steal-A-Kiss.lrc',
  },
]
