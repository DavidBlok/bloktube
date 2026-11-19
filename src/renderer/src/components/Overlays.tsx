import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ChevronRight, TvMinimalPlay, X } from 'lucide-react'
import type { PlaylistEdit } from '@shared/types'
import { blok } from '../api'
import { useEditPlaylist } from '../lib/mutations'
import { queries } from '../lib/query'
import { usePlayer } from '../store/player'
import { useUi, type Dialog, type MenuItem } from '../store/ui'
import { Artwork } from './common'
import { LogoMark } from './Logo'

function MenuEntry({ it, close }: { it: MenuItem; close: () => void }) {
  return (
    <button
      className="cm-item"
      disabled={it.disabled}
      onClick={() => {
        close()
        it.onClick?.()
      }}
    >
      {it.icon && <span className="cm-icon">{it.icon}</span>}
      <span className="cm-label">{it.label}</span>
    </button>
  )
}

function SubMenu({ items, close }: { items: MenuItem[]; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<{ flip: boolean; shift: number }>({ flip: false, shift: 0 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const host = el.parentElement!.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    setStyle({
      flip: host.right + r.width + 8 > window.innerWidth,
      shift: Math.min(0, window.innerHeight - 8 - (host.top + r.height))
    })
  }, [items])

  return (
    <div ref={ref} className={`context-menu cm-submenu ${style.flip ? 'flip' : ''}`} style={{ marginTop: style.shift }}>
      {items.map((it, i) => (it.divider ? <div key={i} className="cm-divider" /> : <MenuEntry key={i} it={it} close={close} />))}
    </div>
  )
}

export function ContextMenu() {
  const menu = useUi((s) => s.menu)
  const close = useUi((s) => s.closeMenu)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [open, setOpen] = useState<number | null>(null)

  useLayoutEffect(() => {
    setOpen(null)
    if (!menu || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const x = menu.place?.right ? menu.x - r.width : menu.x
    const y = menu.place?.above ? menu.y - r.height : menu.y
    setPos({
      x: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - r.height - 8))
    })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    const onWheel = (e: WheelEvent) => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', close)
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', close)
      window.removeEventListener('wheel', onWheel)
    }
  }, [menu, close])

  if (!menu) return null
  return (
    <div ref={ref} className="context-menu" style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      {menu.items.map((it, i) =>
        it.divider ? (
          <div key={i} className="cm-divider" />
        ) : it.submenu ? (
          <div key={i} className="cm-sub-host" onMouseEnter={() => setOpen(i)} onMouseLeave={() => setOpen(null)}>
            <button className={`cm-item ${open === i ? 'open' : ''}`} onClick={() => setOpen(i)}>
              {it.icon && <span className="cm-icon">{it.icon}</span>}
              <span className="cm-label">{it.label}</span>
              <ChevronRight size={16} className="cm-chevron" />
            </button>
            {open === i && <SubMenu items={it.submenu} close={close} />}
          </div>
        ) : (
          <div key={i} onMouseEnter={() => setOpen(null)}>
            <MenuEntry it={it} close={close} />
          </div>
        )
      )}
    </div>
  )
}

export function DialogHost() {
  const dialog = useUi((s) => s.dialog)
  const close = useUi((s) => s.closeDialog)

  useEffect(() => {
    if (!dialog) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog, close])

  if (!dialog) return null
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      {dialog.kind === 'confirm' ? <ConfirmDialog d={dialog} close={close} /> : <EditPlaylistDialog d={dialog} close={close} />}
    </div>
  )
}

function ConfirmDialog({ d, close }: { d: Extract<Dialog, { kind: 'confirm' }>; close: () => void }) {
  return (
    <div className="dialog" role="dialog" aria-modal="true">
      <h2>{d.title}</h2>
      <p className="dialog-message">{d.message}</p>
      <div className="dialog-actions">
        <button className="pill text" onClick={close}>
          Cancel
        </button>
        <button
          className="pill accent"
          autoFocus
          onClick={() => {
            close()
            d.onConfirm()
          }}
        >
          {d.confirmLabel}
        </button>
      </div>
    </div>
  )
}

function EditPlaylistDialog({ d, close }: { d: Extract<Dialog, { kind: 'editPlaylist' }>; close: () => void }) {
  const page = useInfiniteQuery(queries.collection(d.id)).data
  const edit = useEditPlaylist(d.id)
  const [title, setTitle] = useState(d.title)
  const [description, setDescription] = useState(d.description ?? '')
  const [touched, setTouched] = useState(d.description !== undefined)

  useEffect(() => {
    if (!touched && page?.description !== undefined) setDescription(page.description)
  }, [page?.description, touched])

  const save = () => {
    const name = title.trim()
    if (!name) return
    const changes: PlaylistEdit = {}
    if (name !== (page?.title ?? d.title)) changes.title = name
    if (description.trim() !== (page?.description ?? d.description ?? '')) changes.description = description.trim()
    if (changes.title === undefined && changes.description === undefined) return close()
    edit.mutate(changes, { onSuccess: close })
  }

  return (
    <form
      className="dialog edit-playlist"
      role="dialog"
      aria-modal="true"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <header className="dialog-head">
        <h2>Edit details</h2>
        <button type="button" className="icon-btn" onClick={close} title="Close">
          <X size={18} />
        </button>
      </header>
      <div className="ep-body">
        <Artwork src={d.thumb ?? page?.thumb} className="ep-art" />
        <div className="ep-fields">
          <input className="field" value={title} placeholder="Add a name" maxLength={150} autoFocus onChange={(e) => setTitle(e.target.value)} />
          <textarea
            className="field"
            value={description}
            placeholder="Add an optional description"
            maxLength={5000}
            onChange={(e) => {
              setTouched(true)
              setDescription(e.target.value)
            }}
          />
        </div>
      </div>
      <div className="dialog-actions">
        <button type="submit" className="pill white" disabled={!title.trim() || edit.isPending}>
          Save
        </button>
      </div>
    </form>
  )
}

export function Toast() {
  const toast = useUi((s) => s.toast)
  if (!toast) return null
  return (
    <div className="toast" key={toast.id}>
      {toast.text}
    </div>
  )
}

export function AuthOverlay() {
  const auth = usePlayer((s) => s.auth)
  const [slow, setSlow] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [prevStatus, setPrevStatus] = useState(auth.status)

  if (auth.status !== prevStatus) {
    setPrevStatus(auth.status)
    if (prevStatus === 'starting') setLeaving(true)
  }

  useEffect(() => {
    if (auth.status !== 'starting') return
    setSlow(false)
    const t = setTimeout(() => setSlow(true), 15000)
    return () => clearTimeout(t)
  }, [auth.status])

  useEffect(() => {
    if (!leaving) return
    const t = setTimeout(() => setLeaving(false), 400)
    return () => clearTimeout(t)
  }, [leaving])

  if (auth.status === 'starting' || leaving) {
    return (
      <div className={`splash ${leaving ? 'leaving' : ''}`}>
        <LogoMark size={88} animated />
        <div className="splash-logo">BlokTube</div>
        {slow && (
          <div className="splash-slow">
            <p>Still connecting to YouTube Music…</p>
            <button className="pill outline small" onClick={() => blok.app.showEngine()}>
              <TvMinimalPlay size={16} /> Show YouTube Music window
            </button>
          </div>
        )}
      </div>
    )
  }

  if (auth.status === 'consent' || auth.status === 'signing-in' || auth.status === 'error') {
    const text =
      auth.status === 'consent'
        ? 'YouTube needs your cookie choice before it can load. Finish it in the YouTube Music window.'
        : auth.status === 'signing-in'
          ? 'Finish signing in with Google in the YouTube Music window.'
          : (auth.message ?? 'Could not reach YouTube Music.')
    return (
      <div className="banner">
        <span>{text}</span>
        <button className="pill white small" onClick={() => blok.app.showEngine()}>
          Show window
        </button>
      </div>
    )
  }
  return null
}
