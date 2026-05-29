import { Button } from "@ollive/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ollive/ui/components/dropdown-menu";
import { Skeleton } from "@ollive/ui/components/skeleton";
import { cn } from "@ollive/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MoreVertical, Plus } from "lucide-react";

import { orpc, queryClient } from "@/utils/orpc";

interface ChatSidebarProps {
  onNew: () => void;
  onSelect: (id: string) => void;
  selectedConversationId: string | null;
}

export function ChatSidebar({
  selectedConversationId,
  onSelect,
  onNew,
}: ChatSidebarProps) {
  return (
    <aside className="hidden h-full w-64 shrink-0 flex-col border-r bg-muted/30 sm:flex">
      <div className="p-3">
        <Button className="w-full justify-start gap-2" onClick={onNew}>
          <Plus className="h-4 w-4" />
          New chat
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <ConversationList
          onSelect={onSelect}
          selectedConversationId={selectedConversationId}
        />
      </div>
    </aside>
  );
}

interface ConversationListProps {
  onSelect: (id: string) => void;
  selectedConversationId: string | null;
}

function ConversationList({
  selectedConversationId,
  onSelect,
}: ConversationListProps) {
  const conversations = useQuery(orpc.conversation.list.queryOptions());
  const cancelMutation = useMutation(
    orpc.conversation.cancel.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.conversation.list.queryKey(),
        });
      },
    })
  );

  if (conversations.isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton className="h-10 w-full" key={i} />
        ))}
      </div>
    );
  }

  if (!conversations.data?.length) {
    return (
      <p className="px-2 py-4 text-center text-muted-foreground text-sm">
        No conversations yet.
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {conversations.data.map((conversation) => (
        <li
          className={cn(
            "group flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent",
            conversation.id === selectedConversationId && "bg-accent"
          )}
          key={conversation.id}
        >
          <button
            className="flex-1 truncate text-left"
            onClick={() => onSelect(conversation.id)}
            type="button"
          >
            {conversation.title}
          </button>
          <div className="flex shrink-0 items-center gap-1">
            {conversation.status === "cancelled" && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground uppercase">
                cancelled
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-label="Conversation actions"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100"
                    size="icon"
                    variant="ghost"
                  />
                }
              >
                <MoreVertical className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={
                    conversation.status === "cancelled" ||
                    cancelMutation.isPending
                  }
                  onClick={() => cancelMutation.mutate({ id: conversation.id })}
                >
                  Cancel conversation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </li>
      ))}
    </ul>
  );
}
