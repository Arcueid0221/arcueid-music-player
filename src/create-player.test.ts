import { describe, expect, it } from 'vitest'
import { createMusicPlayer } from './create-player'

describe('createMusicPlayer', () => {
  it('explains the dynamic import requirement outside a browser', () => {
    expect(() => createMusicPlayer({ target: {} as ParentNode })).toThrow('SSR 请使用动态导入')
  })
})
