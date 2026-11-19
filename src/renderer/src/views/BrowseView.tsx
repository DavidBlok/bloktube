import { useQuery } from '@tanstack/react-query'
import { errorMessage } from '../api'
import { ShelfView } from '../components/Cards'
import { ErrorState } from '../components/common'
import { Pending } from '../components/Offline'
import { queries } from '../lib/query'

export function BrowseView({ id, params, title }: { id: string; params?: string; title?: string }) {
  const q = useQuery(queries.browse(id, params))
  if (q.isPending) return <Pending paused={q.fetchStatus === 'paused'} />
  if (q.isError && !q.data) return <ErrorState message={errorMessage(q.error)} />
  const page = q.data
  return (
    <div className="view">
      <div className="view-pad">
        <h1 className="page-title">{page.title ?? title}</h1>
        {page.shelves.map((s, i) => (
          <ShelfView key={`${s.title}-${i}`} shelf={s} />
        ))}
        {!page.shelves.length && (
          <div className="empty-state">
            <p>Nothing to show here yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}
