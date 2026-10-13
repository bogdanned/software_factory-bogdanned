"use client";

import { Palette } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PRESETS = ["neutral", "blue", "green", "rose"] as const;

function setPreset(preset: (typeof PRESETS)[number]) {
  if (preset === "neutral") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = preset;
  try {
    localStorage.setItem("bugboard-preset", preset);
  } catch {}
}

export function ThemePicker() {
  const { setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Theme" />}>
        <Palette />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Mode</DropdownMenuLabel>
          {(["light", "dark", "system"] as const).map((m) => (
            <DropdownMenuItem key={m} onClick={() => setTheme(m)} className="capitalize">
              {m}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Colour</DropdownMenuLabel>
          {PRESETS.map((p) => (
            <DropdownMenuItem key={p} onClick={() => setPreset(p)} className="capitalize">
              {p}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
