import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  lyricsBrowseId,
  parseArtist,
  parseCollection,
  parseCollectionContinuation,
  parseLibraryPage,
  parseLyrics,
  parseMoods,
  parseSettings,
  parseSearch,
  parseShelfPage,
  parseSuggestions,
  spokenDurationToSec
} from '../src/shared/ytm/parse'

const fx = (name: string): any => JSON.parse(readFileSync(join(__dirname, 'fixtures', `${name}.json`), 'utf8'))

describe('home', () => {
  it('parses shelves with tracks and cards', () => {
    const page = parseShelfPage(fx('home'))
    expect(page.shelves.length).toBeGreaterThanOrEqual(3)
    expect(page.continuation).toBeTruthy()
    const songs = page.shelves.find((s) => s.layout === 'tracks')!
    expect(songs.tracks[0].videoId).toMatch(/^[\w-]{11}$/)
    expect(songs.tracks[0].artists[0].id).toMatch(/^UC/)
    expect(songs.tracks[0].album?.id).toMatch(/^MPRE/)
    const cards = page.shelves.find((s) => s.layout === 'carousel')!
    expect(cards.cards[0].kind).toBe('playlist')
    expect(cards.cards[0].play?.playlistId).toBeTruthy()
    expect(page.shelves.find((s) => s.title === 'New releases')?.more?.browseId).toBe('FEmusic_new_releases_albums')
  })

  it('parses a section list continuation', () => {
    const page = parseShelfPage(fx('home_cont'))
    expect(page.shelves.length).toBeGreaterThan(0)
  })
})

describe('search', () => {
  it('groups the flat result list and keeps the top result', () => {
    const r = parseSearch(fx('search'), 'daft punk')
    expect(r.top).toMatchObject({ kind: 'artist', id: 'UCRr1xG_2WIDs18a6cIiCxeA', title: 'Daft Punk' })
    expect(r.topTracks.length).toBe(4)
    expect(r.topTracks[0].duration).toMatch(/^\d+:\d{2}$/)
    const titles = r.shelves.map((s) => s.title)
    expect(titles).toEqual(expect.arrayContaining(['Videos', 'Artists', 'Albums', 'Playlists']))
    const albums = r.shelves.find((s) => s.title === 'Albums')!
    expect(albums.cards[0]).toMatchObject({ kind: 'album', id: expect.stringMatching(/^MPRE/) })
    expect(albums.cards[0].play?.playlistId).toMatch(/^OLAK/)
  })

  it.each([
    ['songs', 'tracks', true],
    ['albums', 'cards', true],
    ['artists', 'cards', false],
    ['playlists', 'cards', true]
  ] as const)('parses the %s filter', (filter, field, hasMore) => {
    const r = parseSearch(fx(`search_${filter}`), 'daft punk', filter)
    expect(r[field].length).toBeGreaterThan(5)
    expect(Boolean(r.continuation)).toBe(hasMore)
  })

  it('songs filter includes album and duration', () => {
    const t = parseSearch(fx('search_songs'), 'daft punk', 'songs').tracks[0]
    expect(t.album?.id).toMatch(/^MPRE/)
    expect(t.durationSec).toBeGreaterThan(0)
  })

  it('parses suggestions', () => {
    expect(parseSuggestions(fx('suggestions'))[0]).toBe('daft punk')
  })
})

describe('collections', () => {
  it('parses an album and fills track metadata from the header', () => {
    const p = parseCollection(fx('album'), 'MPREb_dMHztPsrDgN')
    expect(p).toMatchObject({ kind: 'album', title: 'Homework', typeLabel: 'Album', year: '1996' })
    expect(p.artists[0]).toEqual({ id: 'UCRr1xG_2WIDs18a6cIiCxeA', name: 'Daft Punk' })
    expect(p.tracks).toHaveLength(16)
    expect(p.tracks[0]).toMatchObject({ title: 'Daftendirekt', duration: '2:45', index: '1' })
    expect(p.tracks[0].artists[0].name).toBe('Daft Punk')
    expect(p.tracks[0].album?.name).toBe('Homework')
    expect(p.play?.playlistId).toMatch(/^OLAK/)
    expect(p.shuffle).toBeTruthy()
    expect(p.radio).toBeTruthy()
    expect(p.related.map((s) => s.title)).toContain('Other versions')
  })

  it('parses a playlist', () => {
    const p = parseCollection(fx('playlist'), 'VLRDCLAK5uy_kf6c8Ga41e1bLKYCaulkiZ1NIVYJnr3Jk')
    expect(p.kind).toBe('playlist')
    expect(p.tracks).toHaveLength(63)
    expect(p.meta[0]).toBe('63 songs')
    expect(p.tracks[0].artists[0].name).toBe('Kavinsky')
    expect(p.continuation).toBeUndefined()
    expect(p.editable).toBe(false)
    expect(p.privacy).toBeUndefined()
  })

  it('marks own playlists as editable', () => {
    const own = {
      contents: {
        twoColumnBrowseResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                content: {
                  sectionListRenderer: {
                    contents: [
                      {
                        musicEditablePlaylistDetailHeaderRenderer: {
                          header: { musicResponsiveHeaderRenderer: { title: { runs: [{ text: 'My Playlist #4' }] } } },
                          editHeader: { musicPlaylistEditHeaderRenderer: { privacy: 'UNLISTED' } },
                          playlistId: 'PLtest'
                        }
                      }
                    ]
                  }
                }
              }
            }
          ]
        }
      }
    }
    const p = parseCollection(own, 'VLPLtest')
    expect(p.editable).toBe(true)
    expect(p.title).toBe('My Playlist #4')
    expect(p.playlistId).toBe('PLtest')
    expect(p.privacy).toBe('UNLISTED')

    const card = (menu: object[]) =>
      parseLibraryPage({
        contents: {
          singleColumnBrowseResultsRenderer: {
            tabs: [
              {
                tabRenderer: {
                  content: {
                    sectionListRenderer: {
                      contents: [
                        {
                          gridRenderer: {
                            items: [
                              {
                                musicTwoRowItemRenderer: {
                                  title: { runs: [{ text: 'Kids' }] },
                                  navigationEndpoint: {
                                    browseEndpoint: {
                                      browseId: 'VLPLtest',
                                      browseEndpointContextSupportedConfigs: {
                                        browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_PLAYLIST' }
                                      }
                                    }
                                  },
                                  menu: { menuRenderer: { items: menu } }
                                }
                              }
                            ]
                          }
                        }
                      ]
                    }
                  }
                }
              }
            ]
          }
        }
      }).items[0]
    const edit = { menuNavigationItemRenderer: { navigationEndpoint: { playlistEditorEndpoint: { playlistId: 'PLtest' } } } }
    expect(card([edit])?.editable).toBe(true)
    expect(card([])?.editable).toBeUndefined()
  })

  it('parses a podcast show with episodes', () => {
    const p = parseCollection(fx('podcast'), 'MPSPPLEbAHi3fZpuEyBOPtr158TY-FW7P1l4Fg')
    expect(p).toMatchObject({ kind: 'podcast', typeLabel: 'Podcast', title: 'The Rest Is History', playlistId: 'PLEbAHi3fZpuEyBOPtr158TY-FW7P1l4Fg' })
    expect(p.tracks).toHaveLength(20)
    const e = p.tracks[0]
    expect(e.videoId).toMatch(/^[\w-]{11}$/)
    expect(e.durationSec).toBeGreaterThan(60)
    expect(e.episode?.description).toBeTruthy()
    expect(e.episode?.date).toMatch(/ago|\d/)
    expect(e.album?.id).toBe('MPSPPLEbAHi3fZpuEyBOPtr158TY-FW7P1l4Fg')
    expect(p.continuation).toBeTruthy()
    expect(spokenDurationToSec('1 hr 5 min')).toBe(3900)
    expect(spokenDurationToSec('42 min')).toBe(2520)
  })

  it('follows long playlists through continuations', () => {
    const p = parseCollection(fx('playlist_big'), 'VLPLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI')
    expect(p.tracks).toHaveLength(100)
    expect(p.continuation).toBeTruthy()
    const more = parseCollectionContinuation(fx('playlist_big_cont'))
    expect(more.tracks.length).toBeGreaterThan(50)
    expect(more.tracks[0].videoId).toMatch(/^[\w-]{11}$/)
  })
})

describe('artist', () => {
  it('parses header, top songs and shelves', () => {
    const a = parseArtist(fx('artist'), 'UCRr1xG_2WIDs18a6cIiCxeA')
    expect(a.name).toBe('Daft Punk')
    expect(a.subscribers).toMatch(/monthly audience/)
    expect(a.topSongs).toHaveLength(5)
    expect(a.topSongs[0].album?.id).toMatch(/^MPRE/)
    expect(a.topSongsPlaylist).toMatch(/^VL/)
    expect(a.shuffle?.playlistId).toBeTruthy()
    expect(a.radio?.playlistId).toBeTruthy()
    expect(a.shelves.map((s) => s.title)).toEqual(expect.arrayContaining(['Albums', 'Singles & EPs', 'Fans might also like']))
  })
})

describe('misc', () => {
  it('parses moods & genres as coloured categories', () => {
    const moods = parseMoods(fx('moods'))
    expect(moods.length).toBeGreaterThan(10)
    expect(moods[0]).toMatchObject({ kind: 'category', id: 'FEmusic_moods_and_genres_category', color: expect.stringMatching(/^#/) })
  })

  it('finds and parses YouTube Music lyrics', () => {
    expect(lyricsBrowseId(fx('next'))).toMatch(/^MPLYt/)
    expect(parseLyrics(fx('lyrics'))?.text).toContain('phoenix')
  })

  it('parses the explore page', () => {
    const page = parseShelfPage(fx('explore'))
    expect(page.shelves.some((s) => s.layout === 'tracks')).toBe(true)
  })
})

describe('settings', () => {
  it('parses YouTube Music toggles and the audio quality menu', () => {
    const settings = parseSettings(fx('settings'))
    const quality = settings.find((s) => s.kind === 'choice' && s.title === 'Audio quality')
    expect(quality?.kind).toBe('choice')
    if (quality?.kind === 'choice') {
      expect(quality.options.length).toBeGreaterThanOrEqual(3)
      expect(quality.options.map((o) => o.value)).toContain(quality.value)
    }
    const dynamic = settings.find((s) => s.title === 'Dynamic queue')
    expect(dynamic?.kind).toBe('toggle')
    expect(dynamic?.id).toMatch(/^\d+$/)
    expect(settings.every((s) => s.category !== 'Downloads')).toBe(true)
  })
})
