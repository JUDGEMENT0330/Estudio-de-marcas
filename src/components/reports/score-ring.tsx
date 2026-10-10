"use client";

import { useEffect, useState } from "react";
import { gradeLevel, localizeGrade, type GradeLevel } from "@/lib/reports/display-labels";

type RingConfig = { color: string; darkColor: string; trackColor: string; darkTrackColor: string };

const DARK_TRACK = "rgba(255,255,255,0.14)";

const levelConfig: Record<GradeLevel, RingConfig> = {
  excellent: { color: "#1E8E5A", darkColor: "#5FE0A0", trackColor: "#DDF4E8", darkTrackColor: DARK_TRACK },
  good: { color: "#2E75B6", darkColor: "#8CC8FF", trackColor: "#DCEBF8", darkTrackColor: DARK_TRACK },
  developing: { color: "#B7852A", darkColor: "#F2CF7A", trackColor: "#F8EDD3", darkTrackColor: DARK_TRACK },
  needs_attention: { color: "#D25A1E", darkColor: "#FFAA7A", trackColor: "#FCE3D6", darkTrackColor: DARK_TRACK },
  unknown: { color: "#6E6E73", darkColor: "#E5E5EA", trackColor: "#E8E8ED", darkTrackColor: DARK_TRACK },
};

interface ScoreRingProps {
  score: number;
  grade: string;
  size?: number;
  /** Use "dark" when rendering on a colored background (e.g. the navy hero). */
  variant?: "light" | "dark";
}

export function ScoreRing({ score, grade, size = 140, variant = "light" }: ScoreRingProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const config = levelConfig[gradeLevel(grade, score)];
  const label = localizeGrade(grade);
  const isDark = variant === "dark";

  const strokeColor = isDark ? config.darkColor : config.color;
  const trackStroke = isDark ? config.darkTrackColor : config.trackColor;
  const numberColor = isDark ? "#ffffff" : config.color;

  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (animatedScore / 100) * circumference;

  useEffect(() => {
    let frame: number;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setAnimatedScore(score);
      return;
    }
    const duration = 1100;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setAnimatedScore(Math.round(eased * score));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  return (
    <div className="flex flex-col items-center gap-2 animate-score-appear">
      <div style={{ width: size, height: size }} className="relative">
        <svg viewBox="0 0 100 100" className="transform -rotate-90" width={size} height={size}>
          {/* Track */}
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            stroke={trackStroke}
            strokeWidth="7"
          />
          {/* Progress */}
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.32, 0.72, 0, 1)" }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[40px] font-semibold tabular-nums tracking-[-0.03em]" style={{ color: numberColor }}>
            {animatedScore}
          </span>
          <span className={`text-xs -mt-0.5 ${isDark ? "text-white/50" : "text-muted-foreground"}`}>/ 100</span>
        </div>
      </div>
      <div
        className="text-xs font-semibold px-3 py-1 rounded-full"
        style={isDark
          ? { color: config.darkColor, backgroundColor: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.15)" }
          : { color: config.color, backgroundColor: config.trackColor }
        }
      >
        {label}
      </div>
    </div>
  );
}
