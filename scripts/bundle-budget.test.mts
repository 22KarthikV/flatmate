import { describe, expect, it } from "vitest";

import {
  evaluateBudget,
  extractScriptSrcs,
  isMotionChunk,
  type Budgets,
  type RouteBundle,
} from "./bundle-budget.mts";

const budgets: Budgets = { initialKb: { "/": 10, "/dashboard": 10 }, lazyMotionKb: 5 };
const kbytes = (n: number) => n * 1024;

const route = (name: string, sizes: Record<string, number>): RouteBundle => ({
  route: name,
  scripts: Object.entries(sizes).map(([src, size]) => ({ src, gzipBytes: kbytes(size) })),
});

describe("extractScriptSrcs", () => {
  it("returns each script URL once, ignoring inline scripts", () => {
    const html = `
      <script src="/_next/static/a.js" async=""></script>
      <script>self.__next_f=[]</script>
      <script src="/_next/static/b.js"></script>
      <script src="/_next/static/a.js"></script>`;
    expect(extractScriptSrcs(html)).toEqual(["/_next/static/a.js", "/_next/static/b.js"]);
  });

  it("returns nothing for a page without scripts", () => {
    expect(extractScriptSrcs("<html><body>hi</body></html>")).toEqual([]);
  });
});

describe("isMotionChunk", () => {
  it("recognises GSAP core, the ScrollTrigger plugin and Lenis", () => {
    expect(isMotionChunk("/*! GSAP 3.15.0 | https://gsap.com | GreenSock */")).toBe(true);
    expect(isMotionChunk('{start:"top 80%",toggleActions:"play none none none"}')).toBe(true);
    expect(isMotionChunk('document.documentElement.classList.add("lenis-smooth")')).toBe(true);
  });

  it("ignores app code, even code that names ScrollTrigger once", () => {
    expect(isMotionChunk("function Button(){return null}")).toBe(false);
    expect(isMotionChunk("let{ScrollTrigger:t}=await import('gsap/ScrollTrigger')")).toBe(false);
  });
});

describe("evaluateBudget", () => {
  it("passes when everything is within budget", () => {
    const violations = evaluateBudget({
      routes: [route("/", { "/a.js": 4, "/b.js": 5 }), route("/dashboard", { "/a.js": 4 })],
      motionChunks: [{ src: "/gsap.js", gzipBytes: kbytes(3) }],
      budgets,
    });
    expect(violations).toEqual([]);
  });

  it("fails when a route's initial JS exceeds its budget", () => {
    const violations = evaluateBudget({
      routes: [route("/", { "/a.js": 7, "/b.js": 5 }), route("/dashboard", { "/a.js": 1 })],
      motionChunks: [],
      budgets,
    });
    expect(violations).toEqual(["/: initial JS is 12 KB gzipped, budget is 10 KB"]);
  });

  it("fails when motion code leaks into the initial load", () => {
    const violations = evaluateBudget({
      routes: [route("/", { "/a.js": 1, "/gsap.js": 1 }), route("/dashboard", { "/a.js": 1 })],
      motionChunks: [{ src: "/gsap.js", gzipBytes: kbytes(1) }],
      budgets,
    });
    expect(violations).toEqual(["/: motion code in the initial load (/gsap.js)"]);
  });

  it("fails when lazy motion code outgrows its own budget", () => {
    const violations = evaluateBudget({
      routes: [route("/", { "/a.js": 1 }), route("/dashboard", { "/a.js": 1 })],
      motionChunks: [{ src: "/gsap.js", gzipBytes: kbytes(6) }],
      budgets,
    });
    expect(violations).toEqual(["lazy motion code is 6 KB gzipped, budget is 5 KB"]);
  });

  it("flags a route that has no budget so new routes cannot slip through", () => {
    const violations = evaluateBudget({
      routes: [route("/new", { "/a.js": 1 })],
      motionChunks: [],
      budgets,
    });
    expect(violations).toEqual(["/new: no budget defined"]);
  });
});
