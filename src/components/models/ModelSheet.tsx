import { useEffect, useMemo, useRef, useState } from 'react'
import type { ModelInfo } from '../../types/chat'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Sheet } from '../ui/Sheet'
import './ModelSheet.css'

interface ModelSheetProps {
  open: boolean
  onClose: () => void
  models: ModelInfo[]
  selectedId: string
  onSelect: (id: string) => void
  onRefresh?: () => Promise<void>
  isLoading?: boolean
  error?: string | null
}

export function ModelSheet({
  open,
  onClose,
  models,
  selectedId,
  onSelect,
  onRefresh,
  isLoading = false,
  error = null,
}: ModelSheetProps) {
  const [query, setQuery] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [prevOpen, setPrevOpen] = useState(open)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setQuery('')
  }

  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => searchRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])

  const handleRefresh = async () => {
    if (!onRefresh || isRefreshing) return
    setIsRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setIsRefreshing(false)
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return models
    return models.filter((m) =>
      [m.name, m.description, ...(m.badges ?? [])].join(' ').toLowerCase().includes(q)
    )
  }, [models, query])

  // Group models dynamically
  const recommendedModels = useMemo(() => {
    return filtered.filter(
      (m) => m.id === 'auto' || m.group === 'recommended' || m.isRecommended
    )
  }, [filtered])

  const geminiModels = useMemo(() => {
    return filtered.filter(
      (m) =>
        m.id !== 'auto' &&
        !m.isRecommended &&
        m.group !== 'recommended' &&
        (m.id.startsWith('gemini/') || m.group === 'gemini')
    )
  }, [filtered])

  const openrouterModels = useMemo(() => {
    return filtered.filter(
      (m) =>
        m.id !== 'auto' &&
        !m.isRecommended &&
        m.group !== 'recommended' &&
        (m.id.startsWith('openrouter/') || m.group === 'openrouter' || m.group === 'more')
    )
  }, [filtered])

  return (
    <Sheet open={open} onClose={onClose} title="Select model">
      <div className="model-search">
        <Icon name="search" size={17} className="model-search__icon" />
        <input
          ref={searchRef}
          type="search"
          className="model-search__input"
          placeholder="Search models..."
          aria-label="Search models"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          enterKeyHint="search"
        />
        {query.length > 0 && (
          <IconButton
            icon="close"
            label="Clear search"
            size="sm"
            className="model-search__clear"
            onClick={() => {
              setQuery('')
              searchRef.current?.focus()
            }}
          />
        )}
      </div>

      {error && (
        <div className="model-error-banner" role="alert">
          <span>{error}</span>
          {onRefresh && (
            <button
              type="button"
              className="model-refresh-btn"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? 'Refreshing...' : 'Retry'}
            </button>
          )}
        </div>
      )}

      {isLoading && models.length === 0 ? (
        <div className="model-loading-state">
          <div className="model-loading-spinner" />
          <p>Discovering available models from providers...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="model-empty-state">
          <p className="model-empty">No models match “{query.trim()}”.</p>
          {onRefresh && (
            <button
              type="button"
              className="model-refresh-btn"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh Model Catalog'}
            </button>
          )}
        </div>
      ) : (
        <div className="model-list" role="radiogroup" aria-label="Models">
          {/* Recommended Section */}
          {recommendedModels.length > 0 && (
            <section className="model-group">
              <div className="model-group__header">
                <h3 className="model-group__label">Recommended</h3>
              </div>
              {recommendedModels.map((m) => {
                const selected = m.id === selectedId
                const isAuto = m.id === 'auto'
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className="model-item"
                    data-selected={selected || undefined}
                    onClick={() => {
                      onSelect(m.id)
                      onClose()
                    }}
                  >
                    <span className="model-item__main">
                      <span className="model-item__title-row">
                        <span className="model-item__name">{m.name}</span>
                        {isAuto && (
                          <span className="model-auto-tag">
                            ✦ Recommended for this task
                          </span>
                        )}
                      </span>
                      <span className="model-item__desc">{m.description}</span>
                      {m.badges && m.badges.length > 0 && (
                        <span className="model-item__badges">
                          {m.badges.map((b) => (
                            <span key={b} className="model-badge">
                              {b}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                    <span className="model-item__check" aria-hidden="true">
                      {selected && <Icon name="check" size={18} strokeWidth={2.2} />}
                    </span>
                  </button>
                )
              })}
            </section>
          )}

          {/* Gemini Discovered Models */}
          {geminiModels.length > 0 && (
            <section className="model-group">
              <div className="model-group__header">
                <h3 className="model-group__label">Google Gemini</h3>
              </div>
              {geminiModels.map((m) => {
                const selected = m.id === selectedId
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className="model-item"
                    data-selected={selected || undefined}
                    onClick={() => {
                      onSelect(m.id)
                      onClose()
                    }}
                  >
                    <span className="model-item__main">
                      <span className="model-item__name">{m.name}</span>
                      <span className="model-item__desc">{m.description}</span>
                      {m.badges && m.badges.length > 0 && (
                        <span className="model-item__badges">
                          {m.badges.map((b) => (
                            <span key={b} className="model-badge">
                              {b}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                    <span className="model-item__check" aria-hidden="true">
                      {selected && <Icon name="check" size={18} strokeWidth={2.2} />}
                    </span>
                  </button>
                )
              })}
            </section>
          )}

          {/* OpenRouter Discovered Models */}
          {openrouterModels.length > 0 && (
            <section className="model-group">
              <div className="model-group__header">
                <h3 className="model-group__label">OpenRouter</h3>
              </div>
              {openrouterModels.map((m) => {
                const selected = m.id === selectedId
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className="model-item"
                    data-selected={selected || undefined}
                    onClick={() => {
                      onSelect(m.id)
                      onClose()
                    }}
                  >
                    <span className="model-item__main">
                      <span className="model-item__name">{m.name}</span>
                      <span className="model-item__desc">{m.description}</span>
                      {m.badges && m.badges.length > 0 && (
                        <span className="model-item__badges">
                          {m.badges.map((b) => (
                            <span key={b} className="model-badge">
                              {b}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                    <span className="model-item__check" aria-hidden="true">
                      {selected && <Icon name="check" size={18} strokeWidth={2.2} />}
                    </span>
                  </button>
                )
              })}
            </section>
          )}

          {/* Catalog Sync / Refresh Footer */}
          {onRefresh && (
            <div className="model-sheet-footer">
              <button
                type="button"
                className="model-refresh-link"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <Icon name="refresh" size={14} />
                <span>{isRefreshing ? 'Refreshing catalog...' : 'Refresh available models'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
