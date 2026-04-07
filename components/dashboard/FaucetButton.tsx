"use client";

import { Droplet } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FaucetButton() {
  return (
    <Button
      variant="outline"
      className="w-full justify-start gap-3 border-border/60 bg-background/50 text-muted-foreground shadow-sm hover:border-primary/40 hover:bg-primary/10 hover:text-primary transition-all group"
      asChild
    >
      <a
        href="https://faucet.circle.com"
        target="_blank"
        rel="noopener noreferrer"
      >
        <div className="flex items-center justify-center rounded-lg bg-primary/15 p-1 text-primary group-hover:scale-110 transition-transform">
          <Droplet className="h-4 w-4" />
        </div>
        Get EURC/USDC Test Tokens
      </a>
    </Button>
  );
}
