import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, LogOut, PictureInPicture2, TvMinimalPlay } from 'lucide-react'
import type { YtmSetting } from '@shared/types'
import { blok, errorMessage } from '../api'
import { Artwork, Spinner } from '../components/common'
import { ACCENTS, updateAppSettings, useAppSettings } from '../lib/appSettings'
import { queries, queryClient } from '../lib/query'
import { usePlayer } from '../store/player'
import { toast, useUi } from '../store/ui'

function Row({ title, summary, children }: { title: string; summary?: ReactNode; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-text">
        <div className="set-title">{title}</div>
        {summary && <div className="set-summary">{summary}</div>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  )
}

function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? 'on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-thumb" />
    </button>
  )
}

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`
  return `${Math.max(0, Math.round(n / 1024))} KB`
}

function useYtmSetting() {
  const key = queries.ytmSettings().queryKey
  return useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean | string }) => blok.ytm.setSetting(id, value),
    onMutate: async ({ id, value }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const prev = queryClient.getQueryData(key)
      queryClient.setQueryData(key, (d) => d?.map((s) => (s.id === id ? ({ ...s, value } as YtmSetting) : s)))
      return { prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev)
      toast(errorMessage(e))
    }
  })
}

function YtmSettingRow({ s }: { s: YtmSetting }) {
  const set = useYtmSetting()
  if (s.kind === 'toggle') {
    return (
      <Row title={s.title} summary={s.summary}>
        <Switch label={s.title} checked={s.value} onChange={(value) => set.mutate({ id: s.id, value })} />
      </Row>
    )
  }
  return (
    <Row title={s.title} summary={s.summary}>
      <select className="set-select" value={s.value} onChange={(e) => set.mutate({ id: s.id, value: e.target.value })}>
        {s.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Row>
  )
}

function FadeSlider({ value }: { value: number }) {
  const [local, setLocal] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => setLocal(value), [value])
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <Row title="Fade between songs" summary={local ? `${local} seconds` : 'Off'}>
      <input
        className="set-range"
        type="range"
        min={0}
        max={12}
        step={1}
        value={local}
        onChange={(e) => {
          const v = Number(e.target.value)
          setLocal(v)
          clearTimeout(timer.current)
          timer.current = setTimeout(() => updateAppSettings({ fadeSeconds: v }), 300)
        }}
        aria-label="Fade between songs"
      />
    </Row>
  )
}

export function SettingsView() {
  const settings = useAppSettings((s) => s.settings)
  const info = useAppSettings((s) => s.info)
  const auth = usePlayer((s) => s.auth)
  const autoplay = usePlayer((s) => s.queue.autoplayEnabled !== false)
  const downloads = usePlayer((s) => s.downloads)
  const signedIn = auth.status === 'signed-in'
  const ytm = useQuery({ ...queries.ytmSettings(), enabled: signedIn })
  const isMac = blok.platform === 'darwin'

  const ytmIn = (category: string) => (ytm.data ?? []).filter((s) => s.category === category)
  const downloadBytes = downloads.tracks.reduce((a, t) => a + (t.bytes ?? 0), 0)
  const hasDownloads = downloads.tracks.length > 0 || downloads.playlists.length > 0

  const clearDownloads = () =>
    useUi.getState().openDialog({
      kind: 'confirm',
      title: 'Remove all downloads?',
      message: 'Everything you downloaded is deleted from this computer. You can download it again later.',
      confirmLabel: 'Remove all',
      onConfirm: async () => {
        try {
          toast('Removing downloads…')
          toast((await blok.downloads.clear()) ? 'All downloads removed' : 'Some downloads could not be removed')
        } catch (e) {
          toast(errorMessage(e))
        }
      }
    })

  return (
    <div className="view settings">
      <div className="view-pad settings-pad">
        <h1 className="page-title">Settings</h1>

        {signedIn && (
          <section className="set-section">
            <h2>Account</h2>
            <div className="set-account">
              <Artwork src={auth.account?.thumb} size={56} round />
              <div className="set-text">
                <div className="set-title">{auth.account?.name ?? 'Signed in'}</div>
                {auth.account?.handle && <div className="set-summary">{auth.account.handle}</div>}
              </div>
              <button className="pill outline small" onClick={() => blok.auth.signOut()}>
                <LogOut size={14} /> Sign out
              </button>
            </div>
          </section>
        )}

        <section className="set-section">
          <h2>Playback</h2>
          {ytm.isPending && signedIn ? <Spinner /> : ytmIn('Playback').map((s) => <YtmSettingRow key={s.id} s={s} />)}
          <Row title="Autoplay" summary="Keep playing similar music when your queue ends">
            <Switch label="Autoplay" checked={autoplay} onChange={(v) => blok.queue.setAutoplay(v)} />
          </Row>
          <FadeSlider value={settings?.fadeSeconds ?? 0} />
        </section>

        <section className="set-section">
          <h2>Downloads</h2>
          <Row
            title="Storage"
            summary={
              hasDownloads
                ? `${downloads.tracks.length} ${downloads.tracks.length === 1 ? 'song' : 'songs'} · ${formatBytes(downloadBytes)}`
                : 'Nothing downloaded'
            }
          >
            <button className="pill outline small" onClick={clearDownloads} disabled={!hasDownloads}>
              Remove all downloads
            </button>
          </Row>
        </section>

        <section className="set-section">
          <h2>Appearance</h2>
          <Row title="Accent colour">
            <div className="swatches">
              {ACCENTS.map((a) => (
                <button
                  key={a.value}
                  className={`swatch ${settings?.accent === a.value ? 'active' : ''}`}
                  style={{ background: a.value }}
                  title={a.name}
                  aria-label={a.name}
                  onClick={() => updateAppSettings({ accent: a.value })}
                >
                  {settings?.accent === a.value && <Check size={14} strokeWidth={3} />}
                </button>
              ))}
            </div>
          </Row>
        </section>

        <section className="set-section">
          <h2>Desktop</h2>
          <Row
            title={isMac ? 'Show in menu bar' : 'Show in system tray'}
            summary="Playback controls and what's playing, without opening the window"
          >
            <Switch label="Tray icon" checked={!!settings?.tray} onChange={(tray) => updateAppSettings({ tray })} />
          </Row>
          {!isMac && (
            <Row title="Close to tray" summary="Closing the window keeps the music playing in the tray">
              <Switch
                label="Close to tray"
                checked={!!settings?.closeToTray}
                disabled={!settings?.tray}
                onChange={(closeToTray) => updateAppSettings({ closeToTray })}
              />
            </Row>
          )}
          {info?.loginItemSupported && (
            <Row title="Open at login">
              <Switch label="Open at login" checked={!!settings?.openAtLogin} onChange={(openAtLogin) => updateAppSettings({ openAtLogin })} />
            </Row>
          )}
          <Row title="Mini player" summary="A small always-on-top player">
            <button className="pill outline small" onClick={() => blok.app.toggleMini()}>
              <PictureInPicture2 size={14} /> Open
            </button>
          </Row>
        </section>

        {signedIn && ['General', 'Privacy & data', 'Recommendations'].some((c) => ytmIn(c).length > 0) && (
          <section className="set-section">
            <h2>YouTube Music</h2>
            {['General', 'Privacy & data', 'Recommendations'].flatMap((c) => ytmIn(c)).map((s) => (
              <YtmSettingRow key={s.id} s={s} />
            ))}
          </section>
        )}

        <section className="set-section">
          <h2>About</h2>
          <Row title="BlokTube" summary={info ? `Version ${info.version} · Electron ${info.electron}` : undefined}>
            <button className="pill outline small" onClick={() => blok.app.showEngine()}>
              <TvMinimalPlay size={14} /> YouTube Music window
            </button>
          </Row>
        </section>
      </div>
    </div>
  )
}
