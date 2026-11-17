// Standalone example for a future React + Tailwind frontend.
// This file is not served by the existing static /web Railway deployment.
import { GradientBackground } from "./pipo";

export default function GradientBackgroundDemo() {
  return (
    <div className="relative h-[440px] w-full overflow-hidden rounded-xl">
      <GradientBackground className="h-full w-full" />
    </div>
  );
}
