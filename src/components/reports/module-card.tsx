"use client";

import { useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { repairMojibakeText } from "@/lib/text/repair";
import { GradeBadge } from "./grade-badge";

interface ModuleCardProps {
  title: string;
  icon: React.ReactNode;
  grade?: string;
  score?: number;
  findings: string[];
  recommendations: string[];
  children?: React.ReactNode;
  isEstimated?: boolean;
  defaultCollapsed?: boolean;
  collapsedNotice?: string;
  summary?: string;
  badgeLabel?: string;
}

export function ModuleCard({
  title,
  icon,
  grade,
  score,
  findings,
  recommendations,
  children,
  isEstimated = false,
  defaultCollapsed = false,
  collapsedNotice,
  summary,
  badgeLabel = "Detalle de evidencia",
}: ModuleCardProps) {
  const [expanded, setExpanded] = useState(!defaultCollapsed);
  const collapsedSummary = summary || collapsedNotice;

  return (
    <Card>
      <CardHeader
        className={cn("pb-3", defaultCollapsed && "cursor-pointer select-none")}
        onClick={defaultCollapsed ? () => setExpanded((value) => !value) : undefined}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                isEstimated ? "bg-muted/60 text-muted-foreground" : "bg-primary/10 text-primary",
              )}
            >
              {icon}
            </div>
            <div>
              <CardTitle className="text-[17px]">{repairMojibakeText(title)}</CardTitle>
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[10px] font-medium mt-0.5",
                  isEstimated ? "text-amber-600/80" : "text-brand-teal",
                )}
              >
                {isEstimated ? (
                  <span className="h-1 w-1 rounded-full bg-amber-400 inline-block" />
                ) : (
                  <Sparkles className="h-2.5 w-2.5" />
                )}
                {badgeLabel}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {grade && <GradeBadge grade={grade} score={score} size="sm" />}
            {defaultCollapsed && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setExpanded((value) => !value);
                }}
                className="press rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
                aria-expanded={expanded}
                aria-label={expanded ? "Contraer" : "Expandir"}
              >
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                    expanded && "rotate-180",
                  )}
                />
              </button>
            )}
          </div>
        </div>

        {!expanded && collapsedSummary && (
          <p
            className={cn(
              "mt-2 rounded-xl px-3 py-2 text-xs",
              isEstimated
                ? "text-amber-700/80 bg-amber-50 border border-amber-100"
                : "bg-secondary/70 text-muted-foreground",
            )}
          >
            {repairMojibakeText(collapsedSummary)}
          </p>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="animate-fade-in-up space-y-4">
          {children}

          {findings.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Hallazgos clave</h4>
              <ul className="space-y-1">
                {findings.map((finding, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/50 flex-shrink-0" />
                    {repairMojibakeText(finding)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recommendations.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Recomendaciones</h4>
              <ul className="space-y-1">
                {recommendations.slice(0, 3).map((recommendation, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <span
                      className={cn(
                        "mt-1 h-2 w-2 rounded-full flex-shrink-0",
                        index === 0 ? "bg-red-400" : index === 1 ? "bg-brand-gold" : "bg-brand-blue",
                      )}
                    />
                    {repairMojibakeText(recommendation)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
