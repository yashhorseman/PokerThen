import type { TableDataApi } from "@pokerthen/shared";
import { useTableData } from "./deps";

/** Menus never call fetch: reads come from W4's `useTableData()` (TableDataApi). Tests/harness inject via setMenusApi. */
export class HttpError extends Error {
  constructor(public status: number, public body?: unknown) {
    super(`HTTP ${status}`);
  }
}

let override: TableDataApi | null = null;
export function setMenusApi(a: TableDataApi | null): void {
  override = a;
}
export function useMenusData(): TableDataApi {
  const real = useTableData();
  return override ?? real;
}

/** Pull a field->message map out of whatever the actions layer rejected with (422 body shapes). */
export function extractFieldErrors(e: unknown): Record<string, string> | null {
  const x = e as { status?: number; body?: unknown; errors?: unknown; fieldErrors?: unknown } | null;
  const cand = x?.errors ?? x?.fieldErrors ?? x?.body ?? null;
  if (cand && typeof cand === "object") {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(cand as Record<string, unknown>)) if (typeof v === "string") out[k] = v;
    if (Object.keys(out).length) return out;
  }
  if (x?.status === 422) return {};
  return null;
}
