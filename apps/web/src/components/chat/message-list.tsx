import { cn } from "@ollive/ui/lib/utils";
import type { UIMessage } from "ai";
import { Sparkles, User } from "lucide-react";
import { useEffect, useRef } from "react";
import { Streamdown } from "streamdown";

import { OlliveMark } from "@/components/logo";

interface MessageListProps {
  isStreaming: boolean;
  messages: UIMessage[];
  wasCancelled: boolean;
}

export function MessageList({
  messages,
  isStreaming,
  wasCancelled,
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  // Re-scroll on every render so streaming tokens stay in view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll follows message/stream updates
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles className="size-7" />
        </span>
        <div>
          <p className="font-medium text-lg">Start a conversation</p>
          <p className="mt-1 text-muted-foreground text-sm">
            Pick a model and ask anything. Every call is logged to your
            dashboard.
          </p>
        </div>
      </div>
    );
  }

  const lastMessage = messages.at(-1);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
        {messages.map((message) => {
          const isUser = message.role === "user";
          const text = (message.parts ?? [])
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("");
          return (
            <div
              className={cn(
                "flex gap-3",
                isUser ? "flex-row-reverse" : "flex-row"
              )}
              key={message.id}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full",
                  isUser ? "bg-secondary text-secondary-foreground" : ""
                )}
              >
                {isUser ? <User className="size-4" /> : <OlliveMark />}
              </span>
              <div
                className={cn(
                  "min-w-0 max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                  isUser
                    ? "rounded-tr-sm bg-primary text-primary-foreground"
                    : "rounded-tl-sm border bg-card"
                )}
              >
                <Streamdown
                  isAnimating={isStreaming && message.role === "assistant"}
                >
                  {text}
                </Streamdown>
                {wasCancelled &&
                  message.id === lastMessage?.id &&
                  message.role === "assistant" && (
                    <p className="mt-2 text-muted-foreground text-xs italic">
                      Response cancelled.
                    </p>
                  )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}
