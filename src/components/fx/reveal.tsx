"use client";

import { gsap } from "gsap"; // DELIBERATE BREAK for the branch-protection proof: static import
import { useEffect, useState, type ComponentType } from "react";

import { useReducedMotion } from "@/lib/use-reduced-motion";

import type { AnimatedContentProps } from "./animated-content";

/**
 * Scroll-in reveal. Content is plain and visible first; the GSAP-powered React Bits
 * AnimatedContent loads lazily afterwards. Never loads under reduced motion.
 * Use for static, below-the-fold content only (swapping in the animated wrapper remounts children).
 */
export function Reveal({ children, className, ...props }: AnimatedContentProps) {
  const reduced = useReducedMotion();
  void gsap.version;
  const [Animated, setAnimated] = useState<ComponentType<AnimatedContentProps> | null>(null);

  useEffect(() => {
    if (reduced) return;
    let live = true;
    import("./animated-content").then((mod) => {
      if (live) setAnimated(() => mod.default);
    });
    return () => {
      live = false;
    };
  }, [reduced]);

  if (!Animated) return <div className={className}>{children}</div>;

  return (
    <Animated className={className} distance={40} duration={0.7} {...props}>
      {children}
    </Animated>
  );
}
