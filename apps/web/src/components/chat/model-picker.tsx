import { Button } from "@ollive/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ollive/ui/components/dropdown-menu";
import { Skeleton } from "@ollive/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown } from "lucide-react";

import { orpc } from "@/utils/orpc";

interface ModelPickerProps {
  disabled?: boolean;
  onChange: (model: string) => void;
  value: string | null;
}

export function ModelPicker({ value, onChange, disabled }: ModelPickerProps) {
  const models = useQuery(
    orpc.model.list.queryOptions({ staleTime: Number.POSITIVE_INFINITY })
  );

  if (models.isLoading) {
    return <Skeleton className="h-9 w-44" />;
  }

  const options = models.data ?? [];
  const selected = options.find((model) => model.id === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className="max-w-64 justify-between gap-2"
            disabled={disabled || options.length === 0}
            size="sm"
            variant="outline"
          />
        }
      >
        <span className="truncate">
          {selected?.name ?? value ?? "Select model"}
        </span>
        <ChevronDown className="h-4 w-4 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-80">
        {options.map((model) => (
          <DropdownMenuItem
            key={model.id}
            label={model.name}
            onClick={() => onChange(model.id)}
          >
            <Check
              className={`h-4 w-4 shrink-0 ${model.id === value ? "opacity-100" : "opacity-0"}`}
            />
            <span className="truncate">{model.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
