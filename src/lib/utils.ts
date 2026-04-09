import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export async function callEdgeFunction(
  fnName: string,
  body: unknown,
  accessToken: string,
  idempotencyKey?: string
): Promise<Response> {
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}