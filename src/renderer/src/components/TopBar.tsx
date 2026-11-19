import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, CloudUpload, History, House, LogIn, LogOut, PictureInPicture2, Search, Settings, TvMinimalPlay, X } from 'lucide-react'
import { blok } from '../api'
import { useNav } from '../store/nav'
import { usePlayer } from '../store/player'
import { useUi } from '../store/ui'
import { Artwork } from './common'
import { LogoMark } from './Logo'

export function TopBar() {
  const { index, stack, back, forward, go } = useNav()
  const route = stack[index]
  const auth = usePlayer((s) => s.auth)
  const openMenu = useUi((s) => s.openMenu)
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(route.name === 'search' ? route.query : '')
  const [focused, setFocused] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [active, setActive] = useState(-1)
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (route.name === 'search') setValue(route.query)
  }, [route])

  useEffect(() => {
    const focus = () => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener('blok:focus-search', focus)
    return () => window.removeEventListener('blok:focus-search', focus)
  }, [])

  useEffect(() => {
    const q = value.trim()
    if (!q || !focused) {
      setSuggestions([])
      return
    }
    let alive = true
    const t = setTimeout(() => {
      blok.ytm
        .suggestions(q)
        .then((s) => alive && setSuggestions(s.slice(0, 7)))
        .catch(() => undefined)
    }, 140)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [value, focused])

  const commit = (q: string, immediate = false) => {
    clearTimeout(debounce.current)
    const run = () => {
      const nav = useNav.getState()
      const cur = nav.stack[nav.index]
      const filter = cur.name === 'search' ? cur.filter : undefined
      if (cur.name === 'search') nav.replace({ name: 'search', query: q, filter })
      else nav.go({ name: 'search', query: q })
    }
    if (immediate) run()
    else debounce.current = setTimeout(run, 280)
  }

  const isMac = blok.platform === 'darwin'

  return (
    <header className={`topbar ${isMac ? 'mac' : 'win'}`}>
      <div className="tb-nav">
        <button className="tb-brand" onClick={() => go({ name: 'home' })} title="Home">
          <LogoMark size={22} />
          <span>BlokTube</span>
        </button>
        <button className="round-btn" onClick={back} disabled={index === 0} title="Go back">
          <ChevronLeft size={20} />
        </button>
        <button className="round-btn" onClick={forward} disabled={index >= stack.length - 1} title="Go forward">
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="tb-center">
        <button className={`home-btn ${route.name === 'home' ? 'active' : ''}`} onClick={() => go({ name: 'home' })} title="Home">
          <House size={18} fill={route.name === 'home' ? 'currentColor' : 'none'} />
        </button>
        <div className={`search-box ${focused ? 'focused' : ''}`}>
          <Search size={16} className="search-icon" />
          <input
            ref={inputRef}
            value={value}
            placeholder="What do you want to play?"
            spellCheck={false}
            onFocus={() => {
              setFocused(true)
              if (route.name !== 'search') go({ name: 'search', query: value })
            }}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            onChange={(e) => {
              setValue(e.target.value)
              setActive(-1)
              commit(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(suggestions.length - 1, a + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(-1, a - 1))
              } else if (e.key === 'Enter') {
                const q = active >= 0 ? suggestions[active] : value
                setValue(q)
                setSuggestions([])
                commit(q, true)
                inputRef.current?.blur()
              } else if (e.key === 'Escape') {
                inputRef.current?.blur()
              }
            }}
          />
          {value && (
            <button
              className="icon-btn clear"
              onClick={() => {
                setValue('')
                commit('', true)
                inputRef.current?.focus()
              }}
            >
              <X size={15} />
            </button>
          )}
          {focused && suggestions.length > 0 && (
            <div className="suggestions">
              {suggestions.map((s, i) => (
                <div
                  key={s}
                  className={`suggestion ${i === active ? 'active' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    setValue(s)
                    setSuggestions([])
                    commit(s, true)
                    inputRef.current?.blur()
                  }}
                >
                  <Search size={12} /> {s}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="tb-right">
        {auth.status === 'signed-in' ? (
          <button
            className="avatar-btn"
            title={auth.account?.name}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              openMenu(r.right, r.bottom + 8, [
                { label: auth.account?.name ?? 'Account', disabled: true },
                { label: '', divider: true },
                { label: 'Recently played', icon: <History size={16} />, onClick: () => go({ name: 'history' }) },
                { label: 'Your uploads', icon: <CloudUpload size={16} />, onClick: () => go({ name: 'uploads' }) },
                { label: 'Mini player', icon: <PictureInPicture2 size={16} />, onClick: () => blok.app.toggleMini() },
                { label: 'Settings', icon: <Settings size={16} />, onClick: () => go({ name: 'settings' }) },
                { label: '', divider: true },
                { label: 'Show YouTube Music window', icon: <TvMinimalPlay size={16} />, onClick: () => blok.app.showEngine() },
                { label: 'Sign out', icon: <LogOut size={16} />, onClick: () => blok.auth.signOut() }
              ], { right: true })
            }}
          >
            <Artwork src={auth.account?.thumb} size={26} round />
          </button>
        ) : (
          <button className="pill white small" onClick={() => blok.auth.signIn()} disabled={auth.status === 'starting'}>
            <LogIn size={16} /> Sign in
          </button>
        )}
      </div>
    </header>
  )
}
