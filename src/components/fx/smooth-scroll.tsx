"use client";

import { useEffect } from "react";

import { useReducedMotion } from "@/lib/use-reduced-motion";

/**
 * Lenis smooth scroll for public pages, on devices with a fine pointer (desktop) only.
 * Phones keep native touch scrolling. Does nothing under reduced motion.
 */
export function SmoothScroll() {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let cancelled = false;
    let frame = 0;
    let destroy: (() => void) | undefined;

    (async () => {
      const [{ default: Lenis }, { ScrollTrigger }] = await Promise.all([
        import("lenis"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled) return;

      const lenis = new Lenis();
      lenis.on("scroll", ScrollTrigger.update);
      const loop = (time: number) => {
        lenis.raf(time);
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
      destroy = () => lenis.destroy();
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      destroy?.();
    };
  }, [reduced]);

  return null;
}
