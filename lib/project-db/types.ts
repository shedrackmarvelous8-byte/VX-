export type ColumnType =
  | 'text'
  | 'varchar'
  | 'integer'
  | 'boolean'
  | 'timestamp'
  | 'json'
  | 'float'
  | 'uuid'

export interface DatabaseColumnMeta {
  name: string
  type: ColumnType
  primaryKey?: boolean
  nullable?: boolean
  defaultValue?: string | number | boolean | null
  unique?: boolean
  autoIncrement?: boolean
}

export interface DatabaseIndexMeta {
  name: string
  columns: string[]
  unique?: boolean
}

export interface DatabaseTableMeta {
  name: string
  columns: DatabaseColumnMeta[]
  indexes: DatabaseIndexMeta[]
  rowCount: number
  createdAt: string
  updatedAt: string
}

export interface ProjectDatabaseRecord {
  projectId: string
  status: 'ready' | 'initializing' | 'maintenance' | 'error'
  tables: DatabaseTableMeta[]
  connectionStringMasked: string
  createdAt: string
  updatedAt: string
}

export interface DatabaseRow {
  id: string | number
  [key: string]: unknown
  created_at?: string
  updated_at?: string
}

export interface DatabaseMigration {
  id: string
  projectId: string
  name: string
  description?: string
  upSql: string
  downSql?: string
  status: 'applied' | 'pending' | 'failed' | 'rolled_back'
  appliedAt?: string
  error?: string
  createdAt: string
}

export interface DatabaseQueryResult {
  rows: DatabaseRow[]
  rowCount: number
  columns: string[]
  durationMs: number
}

export interface DatabaseOperationAudit {
  id: string
  projectId: string
  userId: string
  operation:
    | 'create_database'
    | 'create_table'
    | 'rename_table'
    | 'delete_table'
    | 'add_column'
    | 'modify_column'
    | 'delete_column'
    | 'create_index'
    | 'insert_row'
    | 'update_row'
    | 'delete_row'
    | 'run_migration'
    | 'query'
  target: string
  details?: Record<string, unknown>
  status: 'success' | 'failed'
  error?: string
  createdAt: string
}
