import fs from 'fs'
import path from 'path'
import type {
  DatabaseColumnMeta,
  DatabaseMigration,
  DatabaseQueryResult,
  DatabaseRow,
  DatabaseTableMeta,
  ProjectDatabaseRecord,
} from './types'
import { logDatabaseAudit } from './audit'

const BASE_SANDBOX_DIR = path.resolve(process.cwd(), '.sandboxes')

interface ProjectDbStore {
  tables: Record<string, DatabaseTableMeta>
  data: Record<string, DatabaseRow[]>
  migrations: DatabaseMigration[]
}

function getDbDir(projectId: string): string {
  const sanitized = projectId.replace(/[^a-zA-Z0-9_-]/g, '')
  return path.join(BASE_SANDBOX_DIR, sanitized, 'db')
}

function getStoreFilePath(projectId: string): string {
  return path.join(getDbDir(projectId), 'project_db.json')
}

function loadProjectDb(projectId: string): ProjectDbStore {
  const filePath = getStoreFilePath(projectId)
  if (!fs.existsSync(filePath)) {
    // Default starter table: users
    const defaultStore: ProjectDbStore = {
      tables: {
        users: {
          name: 'users',
          columns: [
            { name: 'id', type: 'integer', primaryKey: true, autoIncrement: true },
            { name: 'email', type: 'varchar', unique: true, nullable: false },
            { name: 'name', type: 'text', nullable: true },
            { name: 'role', type: 'varchar', defaultValue: 'user' },
            { name: 'created_at', type: 'timestamp' },
            { name: 'updated_at', type: 'timestamp' },
          ],
          indexes: [
            { name: 'idx_users_email', columns: ['email'], unique: true },
          ],
          rowCount: 2,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
      data: {
        users: [
          {
            id: 1,
            email: 'admin@example.com',
            name: 'Demo Admin',
            role: 'admin',
            created_at: new Date(Date.now() - 86400000).toISOString(),
            updated_at: new Date(Date.now() - 86400000).toISOString(),
          },
          {
            id: 2,
            email: 'user@example.com',
            name: 'Demo User',
            role: 'user',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      },
      migrations: [
        {
          id: 'mig_001_initial_schema',
          projectId,
          name: '001_create_users_table',
          description: 'Initial schema creating users table',
          upSql: 'CREATE TABLE users (id SERIAL PRIMARY KEY, email VARCHAR NOT NULL UNIQUE, name TEXT, role VARCHAR DEFAULT \'user\', created_at TIMESTAMP, updated_at TIMESTAMP);',
          status: 'applied',
          appliedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ],
    }

    const dir = getDbDir(projectId)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(filePath, JSON.stringify(defaultStore, null, 2), 'utf-8')
    return defaultStore
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as ProjectDbStore
  } catch {
    return { tables: {}, data: {}, migrations: [] }
  }
}

function saveProjectDb(projectId: string, store: ProjectDbStore): void {
  const dir = getDbDir(projectId)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  const filePath = getStoreFilePath(projectId)
  // Update row counts
  for (const tableName of Object.keys(store.tables)) {
    store.tables[tableName].rowCount = (store.data[tableName] || []).length
    store.tables[tableName].updatedAt = new Date().toISOString()
  }
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8')
}

// ----------------- Public Database Services -----------------

export async function getProjectDatabase(projectId: string): Promise<ProjectDatabaseRecord> {
  const store = loadProjectDb(projectId)
  return {
    projectId,
    status: 'ready',
    tables: Object.values(store.tables),
    connectionStringMasked: `postgresql://project_${projectId.slice(0, 8)}:••••••••@vx-db.internal:5432/${projectId.slice(0, 12)}_db`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export async function listProjectTables(projectId: string): Promise<DatabaseTableMeta[]> {
  const store = loadProjectDb(projectId)
  return Object.values(store.tables)
}

export async function getTableSchema(projectId: string, tableName: string): Promise<DatabaseTableMeta | null> {
  const store = loadProjectDb(projectId)
  return store.tables[tableName] || null
}

export async function createProjectTable(params: {
  projectId: string
  userId: string
  tableName: string
  columns: DatabaseColumnMeta[]
}): Promise<DatabaseTableMeta> {
  const { projectId, userId, tableName, columns } = params
  const cleanName = tableName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (!cleanName) {
    throw new Error('Invalid table name. Must contain alphanumeric characters and underscores only.')
  }

  const store = loadProjectDb(projectId)
  if (store.tables[cleanName]) {
    throw new Error(`Table "${cleanName}" already exists.`)
  }

  // Ensure an 'id' column exists if none specified
  const finalColumns = [...columns]
  if (!finalColumns.some((c) => c.primaryKey)) {
    finalColumns.unshift({
      name: 'id',
      type: 'integer',
      primaryKey: true,
      autoIncrement: true,
    })
  }

  // Ensure timestamps exist
  if (!finalColumns.some((c) => c.name === 'created_at')) {
    finalColumns.push({ name: 'created_at', type: 'timestamp' })
  }
  if (!finalColumns.some((c) => c.name === 'updated_at')) {
    finalColumns.push({ name: 'updated_at', type: 'timestamp' })
  }

  const now = new Date().toISOString()
  const tableMeta: DatabaseTableMeta = {
    name: cleanName,
    columns: finalColumns,
    indexes: [],
    rowCount: 0,
    createdAt: now,
    updatedAt: now,
  }

  store.tables[cleanName] = tableMeta
  store.data[cleanName] = []
  saveProjectDb(projectId, store)

  await logDatabaseAudit({
    projectId,
    userId,
    operation: 'create_table',
    target: cleanName,
    status: 'success',
    details: { columnCount: finalColumns.length },
  })

  return tableMeta
}

export async function deleteProjectTable(params: {
  projectId: string
  userId: string
  tableName: string
}): Promise<{ success: boolean; tableName: string }> {
  const { projectId, userId, tableName } = params
  const store = loadProjectDb(projectId)
  if (!store.tables[tableName]) {
    throw new Error(`Table "${tableName}" does not exist.`)
  }

  delete store.tables[tableName]
  delete store.data[tableName]
  saveProjectDb(projectId, store)

  await logDatabaseAudit({
    projectId,
    userId,
    operation: 'delete_table',
    target: tableName,
    status: 'success',
  })

  return { success: true, tableName }
}

export async function addTableColumn(params: {
  projectId: string
  userId: string
  tableName: string
  column: DatabaseColumnMeta
}): Promise<DatabaseTableMeta> {
  const { projectId, userId, tableName, column } = params
  const store = loadProjectDb(projectId)
  const table = store.tables[tableName]
  if (!table) throw new Error(`Table "${tableName}" does not exist.`)

  const cleanColName = column.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (!cleanColName) throw new Error('Invalid column name.')
  if (table.columns.some((c) => c.name === cleanColName)) {
    throw new Error(`Column "${cleanColName}" already exists on table "${tableName}".`)
  }

  const newCol: DatabaseColumnMeta = {
    ...column,
    name: cleanColName,
  }

  table.columns.push(newCol)
  table.updatedAt = new Date().toISOString()

  // Backfill existing rows with default value
  const rows = store.data[tableName] || []
  for (const r of rows) {
    r[cleanColName] = newCol.defaultValue ?? null
  }

  saveProjectDb(projectId, store)

  await logDatabaseAudit({
    projectId,
    userId,
    operation: 'add_column',
    target: `${tableName}.${cleanColName}`,
    status: 'success',
    details: { type: newCol.type },
  })

  return table
}

export async function deleteTableColumn(params: {
  projectId: string
  userId: string
  tableName: string
  columnName: string
}): Promise<DatabaseTableMeta> {
  const { projectId, userId, tableName, columnName } = params
  const store = loadProjectDb(projectId)
  const table = store.tables[tableName]
  if (!table) throw new Error(`Table "${tableName}" does not exist.`)

  const colIndex = table.columns.findIndex((c) => c.name === columnName)
  if (colIndex === -1) throw new Error(`Column "${columnName}" not found.`)
  if (table.columns[colIndex].primaryKey) throw new Error('Cannot delete primary key column.')

  table.columns.splice(colIndex, 1)
  table.updatedAt = new Date().toISOString()

  // Remove property from all data rows
  const rows = store.data[tableName] || []
  for (const r of rows) {
    delete r[columnName]
  }

  saveProjectDb(projectId, store)

  await logDatabaseAudit({
    projectId,
    userId,
    operation: 'delete_column',
    target: `${tableName}.${columnName}`,
    status: 'success',
  })

  return table
}

// ----------------- Table Rows CRUD -----------------

export async function getTableRows(params: {
  projectId: string
  tableName: string
  page?: number
  pageSize?: number
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}): Promise<{
  rows: DatabaseRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}> {
  const { projectId, tableName, page = 1, pageSize = 20, search, sortBy, sortOrder = 'desc' } = params
  const store = loadProjectDb(projectId)
  const rows = store.data[tableName] || []

  let filtered = [...rows]

  if (search && search.trim()) {
    const q = search.trim().toLowerCase()
    filtered = filtered.filter((r) =>
      Object.values(r).some((val) => String(val ?? '').toLowerCase().includes(q))
    )
  }

  if (sortBy) {
    filtered.sort((a, b) => {
      const valA = a[sortBy]
      const valB = b[sortBy]
      if (valA === valB) return 0
      if (valA === null || valA === undefined) return 1
      if (valB === null || valB === undefined) return -1
      const res = valA > valB ? 1 : -1
      return sortOrder === 'desc' ? -res : res
    })
  }

  const total = filtered.length
  const totalPages = Math.ceil(total / pageSize) || 1
  const start = (page - 1) * pageSize
  const pagedRows = filtered.slice(start, start + pageSize)

  return {
    rows: pagedRows,
    total,
    page,
    pageSize,
    totalPages,
  }
}

export async function insertTableRow(params: {
  projectId: string
  userId: string
  tableName: string
  row: Record<string, unknown>
}): Promise<DatabaseRow> {
  const { projectId, userId, tableName, row } = params
  const store = loadProjectDb(projectId)
  const table = store.tables[tableName]
  if (!table) throw new Error(`Table "${tableName}" does not exist.`)

  const rows = store.data[tableName] || []

  // Determine primary key id
  const pkCol = table.columns.find((c) => c.primaryKey) || table.columns[0]
  let newId = row[pkCol.name]
  if (!newId) {
    if (pkCol.type === 'integer') {
      const maxId = rows.reduce((max, r) => {
        const idNum = Number(r[pkCol.name]) || 0
        return idNum > max ? idNum : max
      }, 0)
      newId = maxId + 1
    } else {
      newId = `row_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    }
  }

  const now = new Date().toISOString()
  const newRow: DatabaseRow = {
    id: (row.id as string | number) ?? newId,
    ...row,
    [pkCol.name]: newId,
    created_at: (row.created_at as string) || now,
    updated_at: now,
  }

  rows.push(newRow)
  store.data[tableName] = rows
  saveProjectDb(projectId, store)

  await logDatabaseAudit({
    projectId,
    userId,
    operation: 'insert_row',
    target: `${tableName}:${newId}`,
    status: 'success',
  })

  return newRow
}

export async function updateTableRow(params: {
  projectId: string
  userId: string
  tableName: string
  rowId: string | number
  updates: Record<string, unknown>
}): Promise<DatabaseRow> {
  const { projectId, userId, tableName, rowId, updates } = params
  const store = loadProjectDb(projectId)
  const table = store.tables[tableName]
  if (!table) throw new Error(`Table "${tableName}" does not exist.`)

  const rows = store.data[tableName] || []
  const pkCol = table.columns.find((c) => c.primaryKey) || table.columns[0]

  const index = rows.findIndex((r) => String(r[pkCol.name]) === String(rowId))
  if (index === -1) {
    throw new Error(`Row with id "${rowId}" not found in "${tableName}".`)
  }

  const updated: DatabaseRow = {
    ...rows[index],
    ...updates,
    [pkCol.name]: rows[index][pkCol.name], // Prevent modifying PK
    updated_at: new Date().toISOString(),
  }

  rows[index] = updated
  store.data[tableName] = rows
  saveProjectDb(projectId, store)

  await logDatabaseAudit({
    projectId,
    userId,
    operation: 'update_row',
    target: `${tableName}:${rowId}`,
    status: 'success',
  })

  return updated
}

export async function deleteTableRow(params: {
  projectId: string
  userId: string
  tableName: string
  rowId: string | number
}): Promise<{ success: boolean; rowId: string | number }> {
  const { projectId, userId, tableName, rowId } = params
  const store = loadProjectDb(projectId)
  const table = store.tables[tableName]
  if (!table) throw new Error(`Table "${tableName}" does not exist.`)

  const rows = store.data[tableName] || []
  const pkCol = table.columns.find((c) => c.primaryKey) || table.columns[0]

  const initialLength = rows.length
  store.data[tableName] = rows.filter((r) => String(r[pkCol.name]) !== String(rowId))

  if (store.data[tableName].length === initialLength) {
    throw new Error(`Row with id "${rowId}" not found in "${tableName}".`)
  }

  saveProjectDb(projectId, store)

  await logDatabaseAudit({
    projectId,
    userId,
    operation: 'delete_row',
    target: `${tableName}:${rowId}`,
    status: 'success',
  })

  return { success: true, rowId }
}

// ----------------- Migrations -----------------

export async function listProjectMigrations(projectId: string): Promise<DatabaseMigration[]> {
  const store = loadProjectDb(projectId)
  return store.migrations || []
}

export async function applyProjectMigration(params: {
  projectId: string
  userId: string
  name: string
  upSql: string
  downSql?: string
  description?: string
}): Promise<DatabaseMigration> {
  const { projectId, userId, name, upSql, downSql, description } = params
  const store = loadProjectDb(projectId)

  const cleanName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
  if (store.migrations.some((m) => m.name === cleanName && m.status === 'applied')) {
    throw new Error(`Migration "${cleanName}" has already been applied.`)
  }

  const migrationId = `mig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const now = new Date().toISOString()

  try {
    // Parse and execute basic CREATE TABLE statements from upSql
    const createMatch = upSql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)\s*\(([\s\S]+?)\)/i)
    if (createMatch) {
      const tbl = createMatch[1].toLowerCase()
      if (!store.tables[tbl]) {
        const colsStr = createMatch[2]
        const colLines = colsStr.split(',').map((s) => s.trim())
        const columns: DatabaseColumnMeta[] = []

        for (const line of colLines) {
          const parts = line.split(/\s+/).filter(Boolean)
          if (parts.length >= 2) {
            const cName = parts[0].toLowerCase()
            const cTypeRaw = parts[1].toLowerCase()
            const isPk = /primary\s+key/i.test(line)
            const isUnique = /unique/i.test(line)
            const isNull = !/not\s+null/i.test(line)

            let cType: DatabaseColumnMeta['type'] = 'varchar'
            if (/int|serial/i.test(cTypeRaw)) cType = 'integer'
            else if (/text/i.test(cTypeRaw)) cType = 'text'
            else if (/bool/i.test(cTypeRaw)) cType = 'boolean'
            else if (/time/i.test(cTypeRaw)) cType = 'timestamp'
            else if (/json/i.test(cTypeRaw)) cType = 'json'
            else if (/float|numeric|decimal/i.test(cTypeRaw)) cType = 'float'

            columns.push({
              name: cName,
              type: cType,
              primaryKey: isPk,
              unique: isUnique,
              nullable: isNull,
            })
          }
        }

        store.tables[tbl] = {
          name: tbl,
          columns,
          indexes: [],
          rowCount: 0,
          createdAt: now,
          updatedAt: now,
        }
        store.data[tbl] = []
      }
    }

    const migration: DatabaseMigration = {
      id: migrationId,
      projectId,
      name: cleanName,
      description,
      upSql,
      downSql,
      status: 'applied',
      appliedAt: now,
      createdAt: now,
    }

    store.migrations.push(migration)
    saveProjectDb(projectId, store)

    await logDatabaseAudit({
      projectId,
      userId,
      operation: 'run_migration',
      target: cleanName,
      status: 'success',
      details: { migrationId },
    })

    return migration
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    const failedMigration: DatabaseMigration = {
      id: migrationId,
      projectId,
      name: cleanName,
      description,
      upSql,
      downSql,
      status: 'failed',
      error: errorMsg,
      createdAt: now,
    }
    store.migrations.push(failedMigration)
    saveProjectDb(projectId, store)

    await logDatabaseAudit({
      projectId,
      userId,
      operation: 'run_migration',
      target: cleanName,
      status: 'failed',
      error: errorMsg,
    })

    throw err
  }
}

// ----------------- Controlled SQL Query -----------------

export async function executeControlledQuery(params: {
  projectId: string
  userId: string
  sql: string
}): Promise<DatabaseQueryResult> {
  const { projectId, userId, sql } = params
  const start = Date.now()
  const trimmed = sql.trim()

  // Disallow forbidden SQL keywords that target platform internals
  if (/(information_schema|pg_|session_user|current_user|drop\s+database|pg_catalog|auth\.|storage\.)/i.test(trimmed)) {
    throw new Error('Access to system catalogs, platform namespaces, or database deletion is forbidden.')
  }

  const store = loadProjectDb(projectId)

  // SELECT query simulation on project tables
  const selectMatch = trimmed.match(/^SELECT\s+([\s\S]+?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+([\s\S]+?))?(?:\s+LIMIT\s+(\d+))?;?$/i)
  if (selectMatch) {
    const tableName = selectMatch[2].toLowerCase()
    const table = store.tables[tableName]
    if (!table) throw new Error(`Table "${tableName}" does not exist in project database.`)

    const rawRows = store.data[tableName] || []
    const limit = selectMatch[4] ? parseInt(selectMatch[4], 10) : 100
    const limited = rawRows.slice(0, limit)
    const columns = table.columns.map((c) => c.name)

    await logDatabaseAudit({
      projectId,
      userId,
      operation: 'query',
      target: tableName,
      status: 'success',
      details: { rowCount: limited.length },
    })

    return {
      rows: limited,
      rowCount: limited.length,
      columns,
      durationMs: Date.now() - start,
    }
  }

  throw new Error('Query could not be executed or is not supported by the controlled query engine.')
}
