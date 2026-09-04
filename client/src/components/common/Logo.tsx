import { cn } from "@/lib/utils";

interface LogoProps {
  collapsed?: boolean;
  className?: string;
  subtitle?: string;
  light?: boolean;
  size?: "sm" | "md" | "lg";
}

export function Logo({
  collapsed = false,
  className,
  subtitle = "Intelligent Document Platform",
  light = false,
  size = "md",
}: LogoProps) {
  const sizeClasses = {
    sm: "h-7 w-7",
    md: "h-9 w-9",
    lg: "h-11 w-11",
  };

  return (
    <div className={cn("flex items-center gap-3 px-1", className)}>
      <div
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-xl bg-white/5 p-1 transition-all",
          sizeClasses[size]
        )}
      >
        <img
          src="/images/emids-logo.png"
          alt="Emids"
          className="h-full w-full object-contain drop-shadow-[0_2px_8px_rgba(71,162,176,0.35)]"
        />
      </div>
      {!collapsed && (
        <div className="leading-none">
          <div
            className={cn(
              "font-display font-bold tracking-[-0.03em]",
              size === "lg" ? "text-[20px]" : "text-[17px]",
              light ? "text-[#0e0e0e]" : "text-white"
            )}
          >
            PACCA <span className="font-normal text-[#47a2b0]">VISION</span>
          </div>
          {subtitle && (
            <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              {subtitle}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
