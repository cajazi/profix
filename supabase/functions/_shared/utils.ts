import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-idempotency-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function createServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );
}

export function createUserClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    }
  );
}

export function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function successResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function getAuthUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const supabase = createUserClient(authHeader);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function logAudit(
  db: ReturnType<typeof createServiceClient>,
  params: {
    user_id?: string;
    action: string;
    table_name?: string;
    record_id?: string;
    old_data?: unknown;
    new_data?: unknown;
    edge_fn_name?: string;
    success?: boolean;
    error_msg?: string;
  }
) {
  await db.from("audit_logs").insert({
    ...params,
    success: params.success ?? true,
  });
}

export async function sendNotification(
  db: ReturnType<typeof createServiceClient>,
  params: {
    user_id: string;
    type: string;
    title: string;
    body?: string;
    data?: Record<string, unknown>;
    action_url?: string;
  }
) {
  await db.from("notifications").insert(params);
}

export const PLATFORM_FEE_RATE = 0.025;

export function calculatePlatformFee(amount: number): number {
  return Math.round(amount * PLATFORM_FEE_RATE * 100) / 100;
}

export async function verifyPaystackWebhookSignature(
  payload: string,
  signature: string
): Promise<boolean> {
  const secret = Deno.env.get("PAYSTACK_WEBHOOK_SECRET")!;
  const enscoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(payload);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const signature_bytes = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    msgData
  );
  const computed = Array.from(new Uint8Array(signature_bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computed === signature;
}