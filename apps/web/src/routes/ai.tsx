import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { ChatThread } from "@/components/chat/chat-thread";
import { ConversationLogPanel } from "@/components/chat/conversation-log-panel";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/ai")({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({ to: "/login", throw: true });
    }
  },
});

interface Mount {
  conversationId: string | null;
  /** Stable React key for the mounted thread; only changes on new/select. */
  key: string;
}

function RouteComponent() {
  const [mount, setMount] = useState<Mount>(() => ({
    key: crypto.randomUUID(),
    conversationId: null,
  }));
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);

  const handleNew = () => {
    setSelectedConversationId(null);
    setMount({ key: crypto.randomUUID(), conversationId: null });
  };

  const handleSelect = (id: string) => {
    setSelectedConversationId(id);
    setMount({ key: id, conversationId: id });
  };

  // A draft just became a real conversation: highlight it in the sidebar without
  // remounting the thread (which would tear down the in-flight stream).
  const handleConversationCreated = (id: string) => {
    setSelectedConversationId(id);
  };

  return (
    <div className="flex h-full overflow-hidden">
      <ChatSidebar
        onNew={handleNew}
        onSelect={handleSelect}
        selectedConversationId={selectedConversationId}
      />
      <main className="min-w-0 flex-1">
        <ChatThread
          initialConversationId={mount.conversationId}
          key={mount.key}
          onConversationCreated={handleConversationCreated}
        />
      </main>
      <ConversationLogPanel conversationId={selectedConversationId} />
    </div>
  );
}
