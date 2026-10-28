import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SECRET = /service[_-]?role|SUPABASE_SECRET|sb_secret_/i;

/** Files that mention a service-role or secret key without being server-only. */
export function findSecretLeaks(files: { path: string; source: string }[]): string[] {
  return files
    .filter(({ source }) => SECRET.test(source))
    .filter(({ source }) => {
      const serverOnly = /import\s+["']server-only["']/.test(source);
      const clientFile = /^\s*["']use client["']/m.test(source);
      return clientFile || !serverOnly;
    })
    .map(({ path: file }) => file);
}

describe("findSecretLeaks", () => {
  it("flags a service-role key in code that is not server-only", () => {
    const files = [{ path: "a.ts", source: "const k = process.env.SUPABASE_SERVICE_ROLE_KEY;" }];
    expect(findSecretLeaks(files)).toEqual(["a.ts"]);
  });

  it("flags it in a client component even if server-only is also imported", () => {
    const source = '"use client";\nimport "server-only";\nconst k = "service_role";';
    expect(findSecretLeaks([{ path: "b.tsx", source }])).toEqual(["b.tsx"]);
  });

  it("allows it in a server-only module", () => {
    const source = 'import "server-only";\nconst k = process.env.SUPABASE_SERVICE_ROLE_KEY;';
    expect(findSecretLeaks([{ path: "admin.ts", source }])).toEqual([]);
  });

  it("ignores files that never mention secrets", () => {
    expect(findSecretLeaks([{ path: "c.ts", source: "export const x = 1;" }])).toEqual([]);
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("the app source", () => {
  it("never exposes a Supabase service-role or secret key to the browser", () => {
    const root = path.resolve(import.meta.dirname, "..", "..");
    const files = walk(root).map((file) => ({
      path: path.relative(root, file),
      source: readFileSync(file, "utf8"),
    }));

    expect(files.length).toBeGreaterThan(10); // sanity: we really scanned the tree
    expect(findSecretLeaks(files)).toEqual([]);
  });
});
