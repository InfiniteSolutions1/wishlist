import { redirect } from "next/navigation";

/** Go back to a page and show a short message at the top. */
export function backWith(path: string, message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}notice=${encodeURIComponent(message)}`);
}

export const text = (form: FormData, key: string, max: number) =>
  String(form.get(key) ?? "").trim().slice(0, max);

export const optional = (form: FormData, key: string, max: number) => text(form, key, max) || null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
