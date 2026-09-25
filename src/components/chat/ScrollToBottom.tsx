import { Icon } from '../ui/Icon'
import './ScrollToBottom.css'

export function ScrollToBottom({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="scroll-bottom"
      data-visible={visible || undefined}
      onClick={onClick}
      aria-label="Scroll to latest"
      tabIndex={visible ? 0 : -1}
    >
      <span className="scroll-bottom__visual"><Icon name="arrowDown" size={18} /></span>
    </button>
  )
}
