import { sanitizeProjectPath } from '../filesystem/path'
import { db } from '../db/store'
import { executeSandboxCommand } from '../sandbox/command'
import { installPackage } from '../sandbox/package-manager'
import { buildProject } from '../sandbox/build'
import {
  getDevServerStatus,
  startDevServer,
  stopDevServer,
} from '../sandbox/dev-server'
import {
  listProjectTables,
  getTableSchema,
  createProjectTable,
  addTableColumn,
  getTableRows,
  insertTableRow,
  updateTableRow,
  deleteTableRow,
  applyProjectMigration,
} from '../project-db/service'
import {
  listProjectEnvVars,
  createProjectEnvVar,
  updateProjectEnvVar,
  deleteProjectEnvVar,
} from '../env-vars/service'

export interface AgentToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<
      string,
      {
        type: string
        description: string
        required?: boolean
      }
    >
    required: string[]
  }
}

export const AGENT_TOOLS: AgentToolDefinition[] = [
  {
    name: 'list_files',
    description: 'Lists all files and directories in the current project repository.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'read_file',
    description: 'Reads the exact text content and metadata of a project file at a given path.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The relative project path of the file to read (e.g., "src/components/Header.tsx").',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'create_file',
    description: 'Creates a brand new file in the project with specified text content.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The relative project path where the file should be created.',
        },
        content: {
          type: 'string',
          description: 'The text content of the file.',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'write_file',
    description: 'Overwrites the full content of an existing project file.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The relative project path of the file to overwrite.',
        },
        content: {
          type: 'string',
          description: 'The complete new content of the file.',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Makes a targeted replacement of a specific snippet within a project file.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The relative project path of the file to edit.',
        },
        targetText: {
          type: 'string',
          description: 'The exact string snippet in the file to be replaced.',
        },
        replacementText: {
          type: 'string',
          description: 'The new string snippet to substitute in place of targetText.',
        },
      },
      required: ['path', 'targetText', 'replacementText'],
    },
  },
  {
    name: 'delete_file',
    description: 'Deletes a file or directory tree in the project repository.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The relative project path of the file or directory to remove.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'create_folder',
    description: 'Creates a folder node in the project file system.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The folder path to create (e.g., "src/components").',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'rename_file',
    description: 'Renames or moves a file or folder within the project.',
    parameters: {
      type: 'object',
      properties: {
        oldPath: {
          type: 'string',
          description: 'The current relative path of the file or folder.',
        },
        newPath: {
          type: 'string',
          description: 'The new relative path for the file or folder.',
        },
      },
      required: ['oldPath', 'newPath'],
    },
  },
  {
    name: 'search_project',
    description: 'Searches across all project file names and contents for matching keyword queries.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keyword text to search for across project files.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'run_command',
    description: 'Executes a controlled development command (npm, npx, tsc, node, etc.) inside the project isolated sandbox.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute inside the sandbox (e.g. "npm test", "npm run build", "ls -la").',
        },
        timeoutMs: {
          type: 'number',
          description: 'Optional execution timeout in milliseconds (default: 30000).',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'install_package',
    description: 'Installs an npm package into the project sandbox and updates package.json.',
    parameters: {
      type: 'object',
      properties: {
        packageName: {
          type: 'string',
          description: 'The npm package name to install (e.g. "lucide-react", "canvas-confetti").',
        },
        dev: {
          type: 'boolean',
          description: 'Whether to install as a devDependency (default: false).',
        },
        version: {
          type: 'string',
          description: 'Optional specific package version or tag.',
        },
      },
      required: ['packageName'],
    },
  },
  {
    name: 'build_project',
    description: 'Executes the project build inside the sandbox and checks for compilation and TypeScript diagnostics.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'start_dev_server',
    description: 'Starts the isolated development server for the project and returns the live preview URL.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'stop_dev_server',
    description: 'Stops the running development server for the project.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_dev_server_status',
    description: 'Checks whether the development server is active and retrieves its port and live preview URL.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_database_tables',
    description: 'Lists all tables and their row counts in the isolated project database.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'read_table_schema',
    description: 'Inspects columns, types, primary keys, and indexes of a specific table in the project database.',
    parameters: {
      type: 'object',
      properties: {
        tableName: {
          type: 'string',
          description: 'Name of the table to inspect.',
        },
      },
      required: ['tableName'],
    },
  },
  {
    name: 'create_table',
    description: 'Creates a new table in the project database with specified columns.',
    parameters: {
      type: 'object',
      properties: {
        tableName: {
          type: 'string',
          description: 'Name of the table to create.',
        },
        columns: {
          type: 'array',
          description: 'Array of column objects, each having name, type, and optional nullable/unique flags.',
        },
      },
      required: ['tableName'],
    },
  },
  {
    name: 'add_column',
    description: 'Adds a new column to an existing table in the project database.',
    parameters: {
      type: 'object',
      properties: {
        tableName: {
          type: 'string',
          description: 'Name of the table.',
        },
        column: {
          type: 'object',
          description: 'Column definition with name and type.',
        },
      },
      required: ['tableName', 'column'],
    },
  },
  {
    name: 'read_database',
    description: 'Queries rows from a table in the project database with optional search and pagination.',
    parameters: {
      type: 'object',
      properties: {
        tableName: {
          type: 'string',
          description: 'Name of the table to read from.',
        },
        page: {
          type: 'number',
          description: 'Page number (default 1).',
        },
        pageSize: {
          type: 'number',
          description: 'Number of rows per page (default 20).',
        },
        search: {
          type: 'string',
          description: 'Optional search text to filter row values.',
        },
      },
      required: ['tableName'],
    },
  },
  {
    name: 'insert_database_row',
    description: 'Inserts a new data row into a project database table.',
    parameters: {
      type: 'object',
      properties: {
        tableName: {
          type: 'string',
          description: 'Name of the table.',
        },
        row: {
          type: 'object',
          description: 'Key-value pairs of column values to insert.',
        },
      },
      required: ['tableName', 'row'],
    },
  },
  {
    name: 'update_database_row',
    description: 'Updates an existing row in a project database table by its ID.',
    parameters: {
      type: 'object',
      properties: {
        tableName: {
          type: 'string',
          description: 'Name of the table.',
        },
        rowId: {
          type: 'string',
          description: 'Primary key ID of the row to update.',
        },
        updates: {
          type: 'object',
          description: 'Key-value pairs of fields to update.',
        },
      },
      required: ['tableName', 'rowId', 'updates'],
    },
  },
  {
    name: 'delete_database_row',
    description: 'Deletes a row from a project database table by its ID.',
    parameters: {
      type: 'object',
      properties: {
        tableName: {
          type: 'string',
          description: 'Name of the table.',
        },
        rowId: {
          type: 'string',
          description: 'Primary key ID of the row to delete.',
        },
      },
      required: ['tableName', 'rowId'],
    },
  },
  {
    name: 'run_database_migration',
    description: 'Runs a SQL migration to modify the project database schema safely.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Unique name/identifier for the migration.',
        },
        upSql: {
          type: 'string',
          description: 'SQL statement to apply (e.g. CREATE TABLE or ALTER TABLE).',
        },
        description: {
          type: 'string',
          description: 'Optional description of what the migration does.',
        },
      },
      required: ['name', 'upSql'],
    },
  },
  {
    name: 'list_environment_variables',
    description: 'Lists all configured environment variables and their scopes (secret values are masked).',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'create_environment_variable',
    description: 'Adds an environment variable to the project with specified scope and secret status.',
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Name of the environment variable (e.g. API_URL, STRIPE_KEY).',
        },
        value: {
          type: 'string',
          description: 'Value of the environment variable.',
        },
        isSecret: {
          type: 'boolean',
          description: 'Whether the variable is a sensitive secret to be encrypted and masked.',
        },
        scope: {
          type: 'string',
          description: 'Scope: "development", "preview", "production", or "all".',
        },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'update_environment_variable',
    description: 'Updates an environment variable for the project.',
    parameters: {
      type: 'object',
      properties: {
        variableId: {
          type: 'string',
          description: 'ID of the environment variable.',
        },
        value: {
          type: 'string',
          description: 'New value of the variable.',
        },
        isSecret: {
          type: 'boolean',
          description: 'Whether the variable is secret.',
        },
        scope: {
          type: 'string',
          description: 'Scope of the variable.',
        },
      },
      required: ['variableId'],
    },
  },
  {
    name: 'delete_environment_variable',
    description: 'Deletes an environment variable from the project.',
    parameters: {
      type: 'object',
      properties: {
        variableId: {
          type: 'string',
          description: 'ID of the variable to delete.',
        },
      },
      required: ['variableId'],
    },
  },
  {
    name: 'get_environment_variable_metadata',
    description: 'Gets metadata (existence, scope, secret flag) for an environment variable without revealing secret value.',
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Name of the variable to check.',
        },
      },
      required: ['key'],
    },
  },
]

export interface AgentContext {
  runId: string
  userId: string
  projectId: string
  conversationId: string
  onActivity?: (activity: {
    type: 'inspecting' | 'reading' | 'writing' | 'modifying' | 'deleting' | 'complete' | 'failed'
    title: string
    detail?: string
    file?: string
  }) => void
}

export async function executeAgentTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: AgentContext
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    switch (toolName) {
      case 'list_files': {
        ctx.onActivity?.({
          type: 'inspecting',
          title: 'Listing project files',
          detail: 'Scanning workspace file tree',
        })
        const files = await db.listProjectFiles(ctx.projectId)
        await db.logAgentOperation({
          runId: ctx.runId,
          projectId: ctx.projectId,
          operationType: 'read',
          filePath: '/',
          status: 'success',
          details: `Listed ${files.length} project files`,
        })
        return {
          success: true,
          result: files.map((f) => ({
            path: f.path,
            name: f.name,
            isFolder: f.is_folder,
            size: f.size,
            version: f.version,
            updatedAt: f.updated_at,
          })),
        }
      }

      case 'read_file': {
        const rawPath = String(args.path || '')
        const safePath = sanitizeProjectPath(rawPath)
        ctx.onActivity?.({
          type: 'reading',
          title: `Reading ${safePath}`,
          file: safePath,
        })

        const file = await db.getProjectFileByPath(ctx.projectId, safePath)
        if (!file) {
          await db.logAgentOperation({
            runId: ctx.runId,
            projectId: ctx.projectId,
            operationType: 'read',
            filePath: safePath,
            status: 'failed',
            details: 'File not found',
          })
          return { success: false, error: `File at "${safePath}" not found.` }
        }

        await db.logAgentOperation({
          runId: ctx.runId,
          projectId: ctx.projectId,
          operationType: 'read',
          filePath: safePath,
          status: 'success',
          details: `Read ${file.size} bytes`,
        })

        return {
          success: true,
          result: {
            path: file.path,
            content: file.content,
            version: file.version,
            size: file.size,
            isFolder: file.is_folder,
          },
        }
      }

      case 'create_file': {
        const rawPath = String(args.path || '')
        const content = typeof args.content === 'string' ? args.content : ''
        const safePath = sanitizeProjectPath(rawPath)
        const fileName = safePath.split('/').pop() || safePath

        ctx.onActivity?.({
          type: 'writing',
          title: `Creating ${safePath}`,
          file: safePath,
        })

        const file = await db.createOrUpdateProjectFile({
          projectId: ctx.projectId,
          userId: ctx.userId,
          path: safePath,
          name: fileName,
          content,
          isFolder: false,
        })

        await db.logAgentOperation({
          runId: ctx.runId,
          projectId: ctx.projectId,
          operationType: 'create',
          filePath: safePath,
          status: 'success',
          details: `Created file version ${file.version}`,
        })

        return { success: true, result: { path: file.path, version: file.version } }
      }

      case 'write_file': {
        const rawPath = String(args.path || '')
        const content = typeof args.content === 'string' ? args.content : ''
        const safePath = sanitizeProjectPath(rawPath)
        const fileName = safePath.split('/').pop() || safePath

        ctx.onActivity?.({
          type: 'writing',
          title: `Writing ${safePath}`,
          file: safePath,
        })

        const file = await db.createOrUpdateProjectFile({
          projectId: ctx.projectId,
          userId: ctx.userId,
          path: safePath,
          name: fileName,
          content,
          isFolder: false,
        })

        await db.logAgentOperation({
          runId: ctx.runId,
          projectId: ctx.projectId,
          operationType: 'write',
          filePath: safePath,
          status: 'success',
          details: `Overwrote file version ${file.version}`,
        })

        return { success: true, result: { path: file.path, version: file.version } }
      }

      case 'edit_file': {
        const rawPath = String(args.path || '')
        const targetText = String(args.targetText || '')
        const replacementText = String(args.replacementText || '')
        const safePath = sanitizeProjectPath(rawPath)

        ctx.onActivity?.({
          type: 'modifying',
          title: `Editing ${safePath}`,
          file: safePath,
        })

        const existing = await db.getProjectFileByPath(ctx.projectId, safePath)
        if (!existing) {
          return { success: false, error: `File at "${safePath}" does not exist.` }
        }

        if (!existing.content.includes(targetText)) {
          return {
            success: false,
            error: `Target text not found in "${safePath}". Make sure the target text matches existing file content exactly.`,
          }
        }

        const newContent = existing.content.replace(targetText, replacementText)
        const updated = await db.createOrUpdateProjectFile({
          projectId: ctx.projectId,
          userId: ctx.userId,
          path: safePath,
          name: existing.name,
          content: newContent,
          isFolder: false,
          expectedVersion: existing.version,
        })

        await db.logAgentOperation({
          runId: ctx.runId,
          projectId: ctx.projectId,
          operationType: 'edit',
          filePath: safePath,
          status: 'success',
          details: `Targeted edit to v${updated.version}`,
        })

        return { success: true, result: { path: updated.path, version: updated.version } }
      }

      case 'delete_file': {
        const rawPath = String(args.path || '')
        const safePath = sanitizeProjectPath(rawPath)

        ctx.onActivity?.({
          type: 'deleting',
          title: `Deleting ${safePath}`,
          file: safePath,
        })

        const deleted = await db.deleteProjectFile(ctx.projectId, safePath)
        await db.logAgentOperation({
          runId: ctx.runId,
          projectId: ctx.projectId,
          operationType: 'delete',
          filePath: safePath,
          status: deleted ? 'success' : 'failed',
          details: deleted ? 'Deleted' : 'Not found',
        })

        return { success: deleted, result: { path: safePath, deleted } }
      }

      case 'create_folder': {
        const rawPath = String(args.path || '')
        const safePath = sanitizeProjectPath(rawPath)
        const folderName = safePath.split('/').pop() || safePath

        const folder = await db.createOrUpdateProjectFile({
          projectId: ctx.projectId,
          userId: ctx.userId,
          path: safePath,
          name: folderName,
          isFolder: true,
        })

        await db.logAgentOperation({
          runId: ctx.runId,
          projectId: ctx.projectId,
          operationType: 'create_folder',
          filePath: safePath,
          status: 'success',
          details: 'Folder created',
        })

        return { success: true, result: { path: folder.path } }
      }

      case 'rename_file': {
        const oldSafe = sanitizeProjectPath(String(args.oldPath || ''))
        const newSafe = sanitizeProjectPath(String(args.newPath || ''))
        const newName = newSafe.split('/').pop() || newSafe

        const moved = await db.renameOrMoveProjectFile(ctx.projectId, oldSafe, newSafe, newName)
        await db.logAgentOperation({
          runId: ctx.runId,
          projectId: ctx.projectId,
          operationType: 'rename',
          filePath: newSafe,
          status: 'success',
          details: `Renamed from ${oldSafe}`,
        })

        return { success: true, result: { path: moved.path } }
      }

      case 'search_project': {
        const query = String(args.query || '')
        const matches = await db.searchProjectFiles(ctx.projectId, query)
        await db.logAgentOperation({
          runId: ctx.runId,
          projectId: ctx.projectId,
          operationType: 'search',
          filePath: query,
          status: 'success',
          details: `Found ${matches.length} matching files`,
        })

        return {
          success: true,
          result: matches.map((m) => ({
            path: m.path,
            name: m.name,
            version: m.version,
          })),
        }
      }

      case 'run_command': {
        const command = String(args.command || '').trim()
        ctx.onActivity?.({
          type: 'writing',
          title: `Executing command: ${command}`,
          detail: 'Running in sandbox',
        })

        const cmdRes = await executeSandboxCommand({
          projectId: ctx.projectId,
          userId: ctx.userId,
          command,
          timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined,
        })

        await db.logAgentOperation({
          runId: ctx.runId,
          projectId: ctx.projectId,
          operationType: 'command',
          filePath: command,
          status: cmdRes.status === 'success' ? 'success' : 'failed',
          details: `Exit code: ${cmdRes.exitCode} (${cmdRes.duration}ms)`,
        })

        return {
          success: cmdRes.status === 'success',
          result: cmdRes,
          error: cmdRes.status !== 'success' ? cmdRes.stderr || cmdRes.error : undefined,
        }
      }

      case 'install_package': {
        const packageName = String(args.packageName || '').trim()
        const dev = Boolean(args.dev)
        const version = args.version ? String(args.version) : undefined

        ctx.onActivity?.({
          type: 'modifying',
          title: `Installing package: ${packageName}`,
          detail: dev ? 'Adding devDependency' : 'Adding dependency',
        })

        const pkgRes = await installPackage({
          projectId: ctx.projectId,
          userId: ctx.userId,
          packageName,
          dev,
          version,
        })

        await db.logAgentOperation({
          runId: ctx.runId,
          projectId: ctx.projectId,
          operationType: 'install_package',
          filePath: packageName,
          status: pkgRes.success ? 'success' : 'failed',
          details: pkgRes.success ? 'Installed successfully' : pkgRes.error,
        })

        return {
          success: pkgRes.success,
          result: pkgRes,
          error: pkgRes.error,
        }
      }

      case 'build_project': {
        ctx.onActivity?.({
          type: 'inspecting',
          title: 'Building project',
          detail: 'Compiling assets and validating types',
        })

        const buildRes = await buildProject(ctx.projectId, ctx.userId)

        await db.logAgentOperation({
          runId: ctx.runId,
          projectId: ctx.projectId,
          operationType: 'build',
          filePath: '/',
          status: buildRes.success ? 'success' : 'failed',
          details: `Errors: ${buildRes.errors.length}, Warnings: ${buildRes.warnings.length}`,
        })

        return {
          success: buildRes.success,
          result: buildRes,
          error: buildRes.errors.length > 0 ? buildRes.errors.map((e) => e.message).join('; ') : undefined,
        }
      }

      case 'start_dev_server': {
        ctx.onActivity?.({
          type: 'writing',
          title: 'Starting development server',
          detail: 'Launching isolated preview runner',
        })

        const serverState = await startDevServer(ctx.projectId, ctx.userId)

        await db.logAgentOperation({
          runId: ctx.runId,
          projectId: ctx.projectId,
          operationType: 'dev_server',
          filePath: '/',
          status: serverState.status === 'running' || serverState.status === 'starting' ? 'success' : 'failed',
          details: `Port ${serverState.port}, status ${serverState.status}`,
        })

        return {
          success: serverState.status === 'running' || serverState.status === 'starting',
          result: serverState,
          error: serverState.error,
        }
      }

      case 'stop_dev_server': {
        const stopped = await stopDevServer(ctx.projectId)
        return { success: true, result: stopped }
      }

      case 'get_dev_server_status': {
        const state = getDevServerStatus(ctx.projectId)
        return { success: true, result: state }
      }

      case 'list_database_tables': {
        ctx.onActivity?.({
          type: 'inspecting',
          title: 'Inspecting database tables',
          detail: 'Scanning project database schema',
        })
        const tables = await listProjectTables(ctx.projectId)
        return { success: true, result: tables }
      }

      case 'read_table_schema': {
        const tableName = String(args.tableName || '')
        const schema = await getTableSchema(ctx.projectId, tableName)
        if (!schema) return { success: false, error: `Table "${tableName}" not found` }
        return { success: true, result: schema }
      }

      case 'create_table': {
        const tableName = String(args.tableName || '')
        const columns = Array.isArray(args.columns) ? args.columns : []
        ctx.onActivity?.({
          type: 'writing',
          title: `Creating table "${tableName}"`,
          detail: `Adding ${columns.length} columns to schema`,
        })
        const table = await createProjectTable({
          projectId: ctx.projectId,
          userId: ctx.userId,
          tableName,
          columns,
        })
        return { success: true, result: table }
      }

      case 'add_column': {
        const tableName = String(args.tableName || '')
        const col = (args.column || {}) as any
        const updated = await addTableColumn({
          projectId: ctx.projectId,
          userId: ctx.userId,
          tableName,
          column: col,
        })
        return { success: true, result: updated }
      }

      case 'read_database': {
        const tableName = String(args.tableName || '')
        const page = typeof args.page === 'number' ? args.page : 1
        const pageSize = typeof args.pageSize === 'number' ? args.pageSize : 20
        const search = typeof args.search === 'string' ? args.search : undefined
        const rows = await getTableRows({
          projectId: ctx.projectId,
          tableName,
          page,
          pageSize,
          search,
        })
        return { success: true, result: rows }
      }

      case 'insert_database_row': {
        const tableName = String(args.tableName || '')
        const row = (args.row || {}) as Record<string, unknown>
        const inserted = await insertTableRow({
          projectId: ctx.projectId,
          userId: ctx.userId,
          tableName,
          row,
        })
        return { success: true, result: inserted }
      }

      case 'update_database_row': {
        const tableName = String(args.tableName || '')
        const rowId = String(args.rowId || '')
        const updates = (args.updates || {}) as Record<string, unknown>
        const updated = await updateTableRow({
          projectId: ctx.projectId,
          userId: ctx.userId,
          tableName,
          rowId,
          updates,
        })
        return { success: true, result: updated }
      }

      case 'delete_database_row': {
        const tableName = String(args.tableName || '')
        const rowId = String(args.rowId || '')
        const deleted = await deleteTableRow({
          projectId: ctx.projectId,
          userId: ctx.userId,
          tableName,
          rowId,
        })
        return { success: true, result: deleted }
      }

      case 'run_database_migration': {
        const name = String(args.name || '')
        const upSql = String(args.upSql || '')
        const description = typeof args.description === 'string' ? args.description : undefined
        ctx.onActivity?.({
          type: 'writing',
          title: `Running migration: ${name}`,
          detail: 'Applying schema changes to project database',
        })
        const migration = await applyProjectMigration({
          projectId: ctx.projectId,
          userId: ctx.userId,
          name,
          upSql,
          description,
        })
        return { success: true, result: migration }
      }

      case 'list_environment_variables': {
        const vars = await listProjectEnvVars(ctx.projectId)
        return { success: true, result: vars }
      }

      case 'create_environment_variable': {
        const key = String(args.key || '')
        const value = String(args.value || '')
        const isSecret = Boolean(args.isSecret)
        const scope = (args.scope as any) || 'all'
        const created = await createProjectEnvVar({
          projectId: ctx.projectId,
          userId: ctx.userId,
          key,
          value,
          isSecret,
          scope,
        })
        return { success: true, result: created }
      }

      case 'update_environment_variable': {
        const variableId = String(args.variableId || '')
        const value = typeof args.value === 'string' ? args.value : undefined
        const isSecret = typeof args.isSecret === 'boolean' ? args.isSecret : undefined
        const scope = args.scope as any
        const updated = await updateProjectEnvVar({
          projectId: ctx.projectId,
          userId: ctx.userId,
          variableId,
          value,
          isSecret,
          scope,
        })
        return { success: true, result: updated }
      }

      case 'delete_environment_variable': {
        const variableId = String(args.variableId || '')
        const deleted = await deleteProjectEnvVar({
          projectId: ctx.projectId,
          userId: ctx.userId,
          variableId,
        })
        return { success: true, result: deleted }
      }

      case 'get_environment_variable_metadata': {
        const key = String(args.key || '').toUpperCase()
        const vars = await listProjectEnvVars(ctx.projectId)
        const match = vars.find((v) => v.key === key)
        if (!match) return { success: true, result: { exists: false, key } }
        return {
          success: true,
          result: {
            exists: true,
            id: match.id,
            key: match.key,
            isSecret: match.isSecret,
            scope: match.scope,
          },
        }
      }

      default:
        return { success: false, error: `Unknown tool name "${toolName}"` }
    }
  } catch (err: unknown) {
    const error = err as Error
    return { success: false, error: error.message || 'Tool execution error' }
  }
}
