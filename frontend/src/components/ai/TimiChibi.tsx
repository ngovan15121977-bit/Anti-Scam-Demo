import { Bot, Heart, Sparkles } from "lucide-react";

type TimiChibiProps = {
  compact?: boolean;
  warning?: boolean;
  walking?: boolean;
};

/** A CSS-only, full-body mascot that can walk without loading image assets. */
export default function TimiChibi({ compact = false, warning = false, walking = false }: TimiChibiProps) {
  const sizeClass = compact ? "h-16 w-14" : "h-28 w-24";
  const iconClass = compact ? "h-5 w-5" : "h-9 w-9";

  return (
    <div className={`relative shrink-0 ${sizeClass} ${walking ? "timi-chibi-walking" : ""}`} aria-hidden="true">
      <Sparkles className="absolute -left-2 top-2 h-3.5 w-3.5 animate-pulse text-amber-400" />
      <Heart className="absolute -right-2 top-4 h-3.5 w-3.5 animate-bounce fill-rose-300 text-rose-400" />

      <div className="absolute left-1/2 top-0 grid h-[47%] w-[74%] -translate-x-1/2 place-items-center rounded-[45%] border-2 border-white bg-gradient-to-br from-rose-400 via-pink-500 to-violet-500 p-1 shadow-md shadow-rose-200">
        <div className="relative grid h-full w-full place-items-center rounded-[42%] bg-white">
          <div className="grid h-[73%] w-[73%] place-items-center rounded-[38%] bg-rose-50">
            <Bot className={`${iconClass} ${warning ? "text-amber-600" : "text-rose-500"}`} />
          </div>
          <span className="absolute bottom-[16%] left-[20%] h-[8%] w-[8%] rounded-full bg-rose-300" />
          <span className="absolute bottom-[16%] right-[20%] h-[8%] w-[8%] rounded-full bg-rose-300" />
        </div>
      </div>

      <div className="timi-chibi-arm-left absolute left-[7%] top-[45%] h-[26%] w-[15%] origin-top-right rounded-full bg-rose-300" />
      <div className="timi-chibi-arm-right absolute right-[7%] top-[45%] h-[26%] w-[15%] origin-top-left rounded-full bg-rose-300" />
      <div className="absolute left-1/2 top-[43%] h-[31%] w-[58%] -translate-x-1/2 rounded-[40%] bg-gradient-to-b from-rose-400 to-pink-600 shadow-sm">
        <span className="absolute left-1/2 top-[38%] h-[13%] w-[50%] -translate-x-1/2 rounded-full bg-white/80" />
        <Sparkles className="absolute bottom-[14%] left-1/2 h-[28%] w-[28%] -translate-x-1/2 text-white" />
      </div>
      <div className="timi-chibi-leg-left absolute bottom-[5%] left-[31%] h-[25%] w-[15%] rounded-b-full bg-violet-500" />
      <div className="timi-chibi-leg-right absolute bottom-[5%] right-[31%] h-[25%] w-[15%] rounded-b-full bg-violet-500" />
      <span className="absolute bottom-0 left-1/2 h-[7%] w-[76%] -translate-x-1/2 rounded-[100%] bg-rose-200/70 blur-sm" />
    </div>
  );
}
