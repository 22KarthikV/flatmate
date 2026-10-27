"use client";

import { useEffect } from "react";

import { registerServiceWorker } from "./register";

export function RegisterServiceWorker() {
  useEffect(() => {
    void registerServiceWorker(navigator, process.env.NODE_ENV === "production");
  }, []);

  return null;
}
