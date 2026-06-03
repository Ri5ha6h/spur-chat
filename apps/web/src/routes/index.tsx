import { createFileRoute } from '@tanstack/react-router'
import { ChatPanel } from '#/components/chat/chat-panel'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return <ChatPanel />
}
