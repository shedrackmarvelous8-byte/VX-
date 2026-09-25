import { useState, useEffect, useCallback } from 'react'
import { Icon } from '../ui/Icon'
import { authFetch } from '../../lib/api'
import type { DatabaseColumnMeta, DatabaseRow, DatabaseTableMeta } from '@/lib/project-db/types'
import './database.css'

interface DatabaseSurfaceProps {
  projectId: string
  projectName?: string
}

export function DatabaseSurface({ projectId }: DatabaseSurfaceProps) {
  const [tables, setTables] = useState<DatabaseTableMeta[]>([])
  const [activeTable, setActiveTable] = useState<string>('')
  const [tableMeta, setTableMeta] = useState<DatabaseTableMeta | null>(null)
  const [rows, setRows] = useState<DatabaseRow[]>([])
  const [loading, setLoading] = useState(false)
  const [totalRows, setTotalRows] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'data' | 'schema'>('data')

  // Modals state
  const [showAddTable, setShowAddTable] = useState(false)
  const [newTableName, setNewTableName] = useState('')
  const [showAddCol, setShowAddCol] = useState(false)
  const [newColName, setNewColName] = useState('')
  const [newColType, setNewColType] = useState<string>('text')
  const [showAddRow, setShowAddRow] = useState(false)
  const [newRowData, setNewRowData] = useState<Record<string, string>>({})
  const [confirmDeleteTable, setConfirmDeleteTable] = useState<string | null>(null)
  const [confirmDeleteRowId, setConfirmDeleteRowId] = useState<string | number | null>(null)

  const fetchTables = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const res = await authFetch(`/api/projects/${projectId}/database/tables`)
      if (res.ok) {
        const data = await res.json()
        const tbls = data.tables || []
        setTables(tbls)
        if (tbls.length > 0 && !activeTable) {
          setActiveTable(tbls[0].name)
        }
      }
    } catch {
      // Ignore background network error
    } finally {
      setLoading(false)
    }
  }, [projectId, activeTable])

  const fetchTableData = useCallback(async (showLoading = false) => {
    if (!activeTable) return
    if (showLoading) setLoading(true)
    try {
      const [metaRes, rowsRes] = await Promise.all([
        authFetch(`/api/projects/${projectId}/database/tables/${activeTable}`),
        authFetch(
          `/api/projects/${projectId}/database/tables/${activeTable}/rows?page=${page}&pageSize=20&search=${encodeURIComponent(
            search
          )}`
        ),
      ])

      if (metaRes.ok) {
        const metaData = await metaRes.json()
        setTableMeta(metaData.table)
      }
      if (rowsRes.ok) {
        const rowsData = await rowsRes.json()
        setRows(rowsData.rows || [])
        setTotalRows(rowsData.total || 0)
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false)
    }
  }, [projectId, activeTable, page, search])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchTables(false)
  }, [fetchTables])

  useEffect(() => {
    if (activeTable) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchTableData(false)
    }
  }, [activeTable, fetchTableData])

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTableName.trim()) return
    try {
      const res = await authFetch(`/api/projects/${projectId}/database/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableName: newTableName }),
      })
      if (res.ok) {
        const data = await res.json()
        setShowAddTable(false)
        setNewTableName('')
        setActiveTable(data.table.name)
        fetchTables()
      }
    } catch (err: unknown) {
      console.error('Failed to create table:', err)
    }
  }

  const handleDeleteTable = async (tableName: string) => {
    try {
      const res = await authFetch(
        `/api/projects/${projectId}/database/tables?tableName=${encodeURIComponent(tableName)}`,
        { method: 'DELETE' }
      )
      if (res.ok) {
        setConfirmDeleteTable(null)
        setActiveTable('')
        fetchTables()
      }
    } catch (err: unknown) {
      console.error('Failed to delete table:', err)
    }
  }

  const handleAddColumn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newColName.trim() || !activeTable) return
    try {
      const res = await authFetch(`/api/projects/${projectId}/database/tables/${activeTable}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          column: {
            name: newColName,
            type: newColType,
            nullable: true,
          },
        }),
      })
      if (res.ok) {
        setShowAddCol(false)
        setNewColName('')
        fetchTableData()
      }
    } catch (err: unknown) {
      console.error('Failed to add column:', err)
    }
  }

  const handleAddRow = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeTable) return
    try {
      const res = await authFetch(
        `/api/projects/${projectId}/database/tables/${activeTable}/rows`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ row: newRowData }),
        }
      )
      if (res.ok) {
        setShowAddRow(false)
        setNewRowData({})
        fetchTableData()
      }
    } catch (err: unknown) {
      console.error('Failed to insert row:', err)
    }
  }

  const handleDeleteRow = async (rowId: string | number) => {
    if (!activeTable) return
    try {
      const res = await authFetch(
        `/api/projects/${projectId}/database/tables/${activeTable}/rows/${rowId}`,
        { method: 'DELETE' }
      )
      if (res.ok) {
        setConfirmDeleteRowId(null)
        fetchTableData()
      }
    } catch (err: unknown) {
      console.error('Failed to delete row:', err)
    }
  }

  return (
    <div className="db-container">
      {/* Top Toolbar */}
      <div className="db-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="db-badge">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
            Project Database Ready
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {tables.length} {tables.length === 1 ? 'Table' : 'Tables'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={`db-btn ${viewMode === 'data' ? 'db-btn-primary' : 'db-btn-secondary'}`}
            onClick={() => setViewMode('data')}
          >
            Data View
          </button>
          <button
            className={`db-btn ${viewMode === 'schema' ? 'db-btn-primary' : 'db-btn-secondary'}`}
            onClick={() => setViewMode('schema')}
          >
            Schema
          </button>
          <button className="db-btn db-btn-secondary" onClick={() => setShowAddTable(true)}>
            + Table
          </button>
          <button className="db-btn db-btn-secondary" onClick={() => fetchTableData()} title="Refresh">
            <Icon name="refresh" size={13} />
          </button>
        </div>
      </div>

      {/* Table Selector Pills */}
      <div className="db-nav-pills">
        {tables.map((t) => (
          <button
            key={t.name}
            className={`db-pill ${activeTable === t.name ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTable(t.name)
              setPage(1)
            }}
          >
            <Icon name="database" size={13} />
            {t.name}
            <span style={{ opacity: 0.6, fontSize: 10 }}>({t.rowCount})</span>
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="db-content">
        {!activeTable ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
            <p>No table selected. Click &quot;+ Table&quot; to create your first project table.</p>
          </div>
        ) : viewMode === 'schema' ? (
          /* Schema Inspector */
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 14, margin: 0 }}>
                Schema: <span style={{ color: '#60a5fa' }}>{activeTable}</span>
              </h3>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="db-btn db-btn-primary" onClick={() => setShowAddCol(true)}>
                  + Add Column
                </button>
                <button
                  className="db-btn db-btn-danger"
                  onClick={() => setConfirmDeleteTable(activeTable)}
                >
                  Delete Table
                </button>
              </div>
            </div>

            <div className="db-table-wrapper" style={{ border: '1px solid var(--border)', borderRadius: 6 }}>
              <table className="db-grid">
                <thead>
                  <tr>
                    <th>Column Name</th>
                    <th>Type</th>
                    <th>Constraints</th>
                    <th>Default</th>
                  </tr>
                </thead>
                <tbody>
                  {(tableMeta?.columns || []).map((col: DatabaseColumnMeta) => (
                    <tr key={col.name}>
                      <td style={{ fontWeight: 600 }}>{col.name}</td>
                      <td>
                        <span style={{ color: '#93c5fd', fontFamily: 'monospace' }}>{col.type}</span>
                      </td>
                      <td>
                        {col.primaryKey && (
                          <span style={{ background: '#3b82f6', color: '#fff', padding: '1px 5px', borderRadius: 4, fontSize: 10, marginRight: 4 }}>
                            PK
                          </span>
                        )}
                        {col.unique && (
                          <span style={{ background: '#8b5cf6', color: '#fff', padding: '1px 5px', borderRadius: 4, fontSize: 10, marginRight: 4 }}>
                            UNIQUE
                          </span>
                        )}
                        {!col.nullable && !col.primaryKey && (
                          <span style={{ opacity: 0.6, fontSize: 10 }}>NOT NULL</span>
                        )}
                      </td>
                      <td style={{ opacity: 0.7, fontFamily: 'monospace' }}>
                        {col.defaultValue !== undefined ? String(col.defaultValue) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Data Grid View */
          <>
            {/* Table Search & Actions */}
            <div style={{ display: 'flex', padding: '8px 12px', gap: 8, alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <input
                type="text"
                placeholder={`Search ${activeTable}...`}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                className="db-input"
                style={{ maxWidth: 220, marginTop: 0 }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {totalRows} {totalRows === 1 ? 'row' : 'rows'}
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button className="db-btn db-btn-primary" onClick={() => setShowAddRow(true)}>
                  + Insert Row
                </button>
              </div>
            </div>

            {/* Grid */}
            <div className="db-table-wrapper">
              {loading ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  Loading records...
                </div>
              ) : rows.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  No rows found in table &quot;{activeTable}&quot;.
                </div>
              ) : (
                <table className="db-grid">
                  <thead>
                    <tr>
                      {(tableMeta?.columns || []).map((col) => (
                        <th key={col.name}>{col.name}</th>
                      ))}
                      <th style={{ width: 40, textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={String(row.id)}>
                        {(tableMeta?.columns || []).map((col) => (
                          <td key={col.name}>
                            {row[col.name] !== null && row[col.name] !== undefined
                              ? typeof row[col.name] === 'object'
                                ? JSON.stringify(row[col.name])
                                : String(row[col.name])
                              : <span style={{ opacity: 0.3 }}>null</span>}
                          </td>
                        ))}
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className="db-btn db-btn-danger"
                            style={{ padding: '2px 6px', fontSize: 10 }}
                            onClick={() => setConfirmDeleteRowId(row.id)}
                            title="Delete row"
                          >
                            Del
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Page {page} of {Math.ceil(totalRows / 20) || 1}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="db-btn db-btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{ opacity: page <= 1 ? 0.4 : 1 }}
                >
                  Prev
                </button>
                <button
                  className="db-btn db-btn-secondary"
                  disabled={page * 20 >= totalRows}
                  onClick={() => setPage((p) => p + 1)}
                  style={{ opacity: page * 20 >= totalRows ? 0.4 : 1 }}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Add Table Modal */}
      {showAddTable && (
        <div className="db-modal-overlay">
          <div className="db-modal">
            <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>Create Table</h4>
            <form onSubmit={handleCreateTable}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Table Name</label>
              <input
                type="text"
                placeholder="e.g. products, orders, posts"
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                className="db-input"
                autoFocus
                required
              />
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0 16px' }}>
                Tables are created with primary key &quot;id&quot; and timestamps automatically.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="db-btn db-btn-secondary"
                  onClick={() => setShowAddTable(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="db-btn db-btn-primary">
                  Create Table
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Column Modal */}
      {showAddCol && (
        <div className="db-modal-overlay">
          <div className="db-modal">
            <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>Add Column to {activeTable}</h4>
            <form onSubmit={handleAddColumn}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Column Name</label>
              <input
                type="text"
                placeholder="e.g. price, status, description"
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                className="db-input"
                autoFocus
                required
              />
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginTop: 12 }}>
                Column Type
              </label>
              <select
                value={newColType}
                onChange={(e) => setNewColType(e.target.value)}
                className="db-input"
              >
                <option value="text">text</option>
                <option value="varchar">varchar</option>
                <option value="integer">integer</option>
                <option value="float">float</option>
                <option value="boolean">boolean</option>
                <option value="timestamp">timestamp</option>
                <option value="json">json</option>
              </select>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button
                  type="button"
                  className="db-btn db-btn-secondary"
                  onClick={() => setShowAddCol(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="db-btn db-btn-primary">
                  Add Column
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Row Modal */}
      {showAddRow && (
        <div className="db-modal-overlay">
          <div className="db-modal">
            <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>Insert Row into {activeTable}</h4>
            <form onSubmit={handleAddRow}>
              {(tableMeta?.columns || [])
                .filter((c) => !c.primaryKey && c.name !== 'created_at' && c.name !== 'updated_at')
                .map((col) => (
                  <div key={col.name} style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {col.name} <span style={{ opacity: 0.6 }}>({col.type})</span>
                    </label>
                    <input
                      type="text"
                      className="db-input"
                      value={newRowData[col.name] || ''}
                      onChange={(e) =>
                        setNewRowData({ ...newRowData, [col.name]: e.target.value })
                      }
                      placeholder={`Enter ${col.name}`}
                    />
                  </div>
                ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button
                  type="button"
                  className="db-btn db-btn-secondary"
                  onClick={() => setShowAddRow(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="db-btn db-btn-primary">
                  Save Row
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Table Dialog */}
      {confirmDeleteTable && (
        <div className="db-modal-overlay">
          <div className="db-modal">
            <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#ef4444' }}>
              Confirm Table Deletion
            </h4>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Are you sure you want to permanently delete table &quot;{confirmDeleteTable}&quot;? All rows and data inside will be removed.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button
                className="db-btn db-btn-secondary"
                onClick={() => setConfirmDeleteTable(null)}
              >
                Cancel
              </button>
              <button
                className="db-btn db-btn-danger"
                onClick={() => handleDeleteTable(confirmDeleteTable)}
              >
                Delete Table
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Row Dialog */}
      {confirmDeleteRowId !== null && (
        <div className="db-modal-overlay">
          <div className="db-modal">
            <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#ef4444' }}>
              Confirm Row Deletion
            </h4>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Delete row #{String(confirmDeleteRowId)} permanently?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button
                className="db-btn db-btn-secondary"
                onClick={() => setConfirmDeleteRowId(null)}
              >
                Cancel
              </button>
              <button
                className="db-btn db-btn-danger"
                onClick={() => handleDeleteRow(confirmDeleteRowId)}
              >
                Delete Row
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
