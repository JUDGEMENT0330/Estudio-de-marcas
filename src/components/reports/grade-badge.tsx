import { cn } from "@/lib/utils";
import { gradeLevel, localizeGrade, type GradeLevel } from "@/lib/reports/display-labels";

// ---------------------------------------------------------------------------
// Color mapping for both legacy single-letter grades AND new descriptive labels
// ---------------------------------------------------------------------------

const LEVEL_COLORS: Record<GradeLevel, string> = {
  excellent: "bg-emerald-50 text-emerald-800 border-emerald-200/70",
  good: "bg-sky-50 text-brand-navy border-sky-200/70",
  developing: "bg-amber-50 text-amber-800 border-amber-200/70",
  needs_attention: "bg-orange-50 text-orange-800 border-orange-200/70",
  unknown: "bg-secondary text-foreground border-border",
};

/** Map a grade string (EN o ES) to its color classes */
function getGradeColors(grade: string, score?: number): string {
  return LEVEL_COLORS[gradeLevel(grade, score)];
}

/** Check if grade is a single character (legacy A-F) */
function isLetterGrade(grade: string): boolean {
  return /^[A-F]$/i.test(grade.trim());
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface GradeBadgeProps {
  grade: string;
  score?: number;
  size?: "sm" | "md" | "lg";
  showScore?: boolean;
}

export function GradeBadge({ grade, score, size = "md", showScore = true }: GradeBadgeProps) {
  const isLetter = isLetterGrade(grade);

  // For single-letter grades: square badge with large letter
  // For descriptive labels: wider rounded badge with text
  if (isLetter) {
    const sizeClasses = {
      sm: "h-8 w-8 text-sm",
      md: "h-12 w-12 text-xl",
      lg: "h-20 w-20 text-4xl",
    };

    return (
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "flex items-center justify-center rounded-2xl border font-semibold flex-shrink-0",
            sizeClasses[size],
            getGradeColors(grade, score)
          )}
        >
          {grade}
        </div>
        {showScore && score !== undefined && (
          <span className="text-sm tabular-nums text-muted-foreground">{score}/100</span>
        )}
      </div>
    );
  }

  // Descriptive label badge (context-aware scoring)
  const labelSizeClasses = {
    sm: "px-2 py-1 text-xs",
    md: "px-3 py-1.5 text-sm",
    lg: "px-4 py-2 text-base",
  };

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "flex items-center justify-center rounded-full border font-medium whitespace-nowrap flex-shrink-0",
          labelSizeClasses[size],
          getGradeColors(grade, score)
        )}
      >
        {localizeGrade(grade)}
      </div>
      {showScore && score !== undefined && (
        <span className="text-sm tabular-nums text-muted-foreground">{score}/100</span>
      )}
    </div>
  );
}
