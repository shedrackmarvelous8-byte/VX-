import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import type { AuthUser } from '../../context/AuthContext'
import './Header.css'

interface HeaderProps {
  /** Hide the menu button when a docked sidebar is already visible (desktop) */
  hideMenu?: boolean
  projectName: string
  modelName?: string
  sidebarOpen: boolean
  scrolled: boolean
  user?: AuthUser | null
  onToggleSidebar: () => void
  onOpenProject?: () => void
  onOpenModel?: () => void
  onOpenAuth?: (mode?: 'login' | 'signup') => void
  onOpenAccount?: () => void
}

export function Header({
  projectName,
  modelName,
  hideMenu,
  sidebarOpen,
  scrolled,
  user,
  onToggleSidebar,
  onOpenProject,
  onOpenModel,
  onOpenAuth,
  onOpenAccount,
}: HeaderProps) {
  const userInitial = (user?.display_name?.[0] || user?.email?.[0] || 'U').toUpperCase()

  return (
    <header className="header" data-menu-hidden={hideMenu || undefined} data-scrolled={scrolled || undefined}>
      <div className="header__left">
        {!hideMenu && (
          <IconButton
            icon="menu"
            label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            aria-expanded={sidebarOpen}
            aria-controls="sidebar"
            onClick={onToggleSidebar}
            className="header__menu"
          />
        )}
        <button type="button" className="header__project" onClick={onOpenProject} aria-label={`Project: ${projectName}`}>
          <span className="header__project-name">{projectName}</span>
          <Icon name="chevronDown" size={16} className="header__chevron" />
        </button>
      </div>

      <div className="header__right">
        <button
          type="button"
          className="header__model"
          onClick={onOpenModel}
          aria-haspopup="dialog"
          aria-label={`Model selector: currently ${modelName || 'Auto'}`}
        >
          <span>{modelName ? `Model: ${modelName}` : 'Model: Auto'}</span>
          <Icon name="chevronDown" size={15} />
        </button>

        {user ? (
          <button
            type="button"
            className="header__account-btn"
            onClick={onOpenAccount}
            title={user.display_name || user.email}
            aria-label="User account and settings"
          >
            <span className="header__avatar">{userInitial}</span>
          </button>
        ) : (
          <button
            type="button"
            className="header__auth-btn"
            onClick={() => onOpenAuth?.('login')}
          >
            <Icon name="user" size={15} />
            <span>Sign In</span>
          </button>
        )}
      </div>
    </header>
  )
}
