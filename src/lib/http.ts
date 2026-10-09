import { NextResponse } from "next/server";

export const ok = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export function validId(id: unknown): id is string {
  return typeof id === "string" && /^[a-f\d]{24}$/i.test(id);
}

export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

export function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
