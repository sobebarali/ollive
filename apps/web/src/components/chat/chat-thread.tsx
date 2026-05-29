import { useChat } from "@ai-sdk/react";
import { env } from "@ollive/env/web";
import { Button } from "@ollive/ui/components/button";
import { Input } from "@ollive/ui/components/input";
import { Skeleton } from "@ollive/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Send, Square } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { client, orpc, queryClient } from "@/utils/orpc";
import { MessageList } from "./message-list";
import { ModelPicker } from "./model-picker";

// Substrings used to pick a sensible default model for a fresh chat, in priority order.
const PREFERRED_MODEL_TOKENS = [
  "claude-sonnet",
  "gpt-4o",
  "gemini-2",
  "deepseek-chat",
];

interface ThreadMessage {
  content: string;
  id: string;
  role: string;
}

function toUIMessages(dbMessages: ThreadMessage[]): UIMessage[] {
  return dbMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      parts: [{ type: "text" as const, text: m.content }],
    }));
}

interface ChatThreadProps {
  /** Set when resuming an existing conversation; null for a fresh draft. */
  initialConversationId: string | null;
  onConversationCreated: (id: string) => void;
}

/**
 * Loads an existing thread before mounting the chat so `useChat` sees the right
 * initial messages on its first render (it reads `messages` only at mount).
 */
export function ChatThread({
  initialConversationId,
  onConversationCreated,
}: ChatThreadProps) {
  const convo = useQuery(
    orpc.conversation.get.queryOptions({
      input: { id: initialConversationId ?? "" },
      enabled: initialConversationId !== null,
    })
  );

  if (initialConversationId !== null && convo.isPending) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="ml-8 h-16" />
        <Skeleton className="mr-8 h-24" />
        <Skeleton className="ml-8 h-16" />
      </div>
    );
  }

  return (
    <ChatThreadReady
      conversationId={initialConversationId}
      initialMessages={convo.data ? toUIMessages(convo.data.messages) : []}
      initialModel={convo.data?.conversation.model ?? null}
      onConversationCreated={onConversationCreated}
    />
  );
}

interface ChatThreadReadyProps {
  conversationId: string | null;
  initialMessages: UIMessage[];
  initialModel: string | null;
  onConversationCreated: (id: string) => void;
}

function ChatThreadReady({
  conversationId,
  initialMessages,
  initialModel,
  onConversationCreated,
}: ChatThreadReadyProps) {
  const models = useQuery(
    orpc.model.list.queryOptions({ staleTime: Number.POSITIVE_INFINITY })
  );
  const [selectedModel, setSelectedModel] = useState<string | null>(
    initialModel
  );
  const [input, setInput] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [wasCancelled, setWasCancelled] = useState(false);

  // Stable for the component's life. A changing/undefined id makes useChat recreate its Chat and
  // wipe streamed messages on every render, so a draft gets a fixed client-side id up front.
  const [chatId] = useState(() => conversationId ?? crypto.randomUUID());
  const conversationIdRef = useRef(conversationId);
  const selectedModelRef = useRef(selectedModel);
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  // Default a fresh draft to a common chat model once the list loads, falling back to the first.
  useEffect(() => {
    if (selectedModel || !models.data?.length) {
      return;
    }
    const preferred = PREFERRED_MODEL_TOKENS.map((token) =>
      models.data.find((model) => model.id.includes(token))
    ).find(Boolean);
    setSelectedModel((preferred ?? models.data[0]).id);
  }, [selectedModel, models.data]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${env.VITE_SERVER_URL}/ai`,
        credentials: "include",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            conversationId: conversationIdRef.current,
            model: selectedModelRef.current,
            messages,
          },
        }),
      }),
    []
  );

  const { messages, sendMessage, status, stop, error, clearError, regenerate } =
    useChat({
      id: chatId,
      messages: initialMessages,
      transport,
      onFinish: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.conversation.list.queryKey(),
        });
        const id = conversationIdRef.current;
        if (id) {
          queryClient.invalidateQueries({
            queryKey: orpc.conversation.get.queryKey({ input: { id } }),
          });
        }
      },
    });

  const isStreaming = status === "streaming";

  useEffect(() => {
    if (!isStreaming && isCancelling) {
      setIsCancelling(false);
    }
  }, [isStreaming, isCancelling]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = input.trim();
    const model = selectedModel;
    if (!(text && model) || isStreaming || isCancelling) {
      return;
    }
    setWasCancelled(false);

    if (conversationIdRef.current === null) {
      try {
        const created = await client.conversation.create({
          model,
          title: text.slice(0, 80),
        });
        conversationIdRef.current = created.id;
        queryClient.invalidateQueries({
          queryKey: orpc.conversation.list.queryKey(),
        });
        onConversationCreated(created.id);
      } catch (err) {
        toast.error(
          `Failed to start conversation: ${err instanceof Error ? err.message : "unknown error"}`
        );
        return;
      }
    }

    setInput("");
    sendMessage({ text });
  };

  const handleCancel = () => {
    setIsCancelling(true);
    setWasCancelled(true);
    stop();
  };

  return (
    <div className="grid h-full grid-rows-[auto_1fr_auto] overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <p className="font-medium text-sm">Conversation</p>
        <ModelPicker onChange={setSelectedModel} value={selectedModel} />
      </div>

      <MessageList
        isStreaming={isStreaming}
        messages={messages}
        wasCancelled={wasCancelled}
      />

      <div className="border-t bg-background">
        {error && (
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-4 pt-3 text-sm">
            <span className="text-destructive">
              {error.message || "Something went wrong."}
            </span>
            <div className="flex shrink-0 gap-2">
              <Button onClick={() => regenerate()} size="sm" variant="outline">
                Retry
              </Button>
              <Button onClick={() => clearError()} size="sm" variant="ghost">
                Dismiss
              </Button>
            </div>
          </div>
        )}
        <form
          className="mx-auto flex w-full max-w-3xl items-center gap-2 p-4"
          onSubmit={handleSubmit}
        >
          <Input
            autoComplete="off"
            autoFocus
            className="h-11 flex-1 rounded-xl"
            name="prompt"
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message Ollive…"
            value={input}
          />
          {isStreaming ? (
            <Button
              aria-label="Cancel response"
              className="size-11 rounded-xl"
              disabled={isCancelling}
              onClick={handleCancel}
              size="icon"
              type="button"
              variant="destructive"
            >
              <Square size={16} />
            </Button>
          ) : (
            <Button
              aria-label="Send message"
              className="size-11 rounded-xl"
              disabled={!input.trim() || isCancelling || !selectedModel}
              size="icon"
              type="submit"
            >
              <Send size={18} />
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
