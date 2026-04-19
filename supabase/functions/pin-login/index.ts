import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  successResponse,
} from "../_shared/utils.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const db = createServiceClient();

  try {
    const { identifier, pin_hash, device_fingerprint } = await req.json();

    if (!identifier || !pin_hash || !device_fingerprint) {
      return errorResponse("Missing required fields");
    }

    // Find user by email or phone
    const { data: user, error: userErr } = await db
      .from("users")
      .select("id, email, full_name, role, pin_hash, is_banned")
      .or(`email.eq.${identifier},phone_number.eq.${identifier}`)
      .single();

    if (userErr || !user) {
      return errorResponse("Invalid credentials", 401);
    }

    if (user.is_banned) {
      return errorResponse("Account suspended. Contact support.", 403);
    }

    if (!user.pin_hash) {
      return errorResponse("PIN not set. Please reset your account.", 401);
    }

    // Verify PIN
    if (user.pin_hash !== pin_hash) {
      return errorResponse("Incorrect PIN", 401);
    }

    // Check if device is trusted
    const { data: device } = await db
      .from("device_sessions")
      .select("id, last_seen")
      .eq("user_id", user.id)
      .eq("device_fingerprint", device_fingerprint)
      .single();

    const isTrusted = !!device;

    if (isTrusted) {
      // Update last seen
      await db
        .from("device_sessions")
        .update({ last_seen: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("device_fingerprint", device_fingerprint);

      // Sign in directly using admin — return session
      const { data: sessionData, error: sessionErr } = await db.auth.admin
        .createSession({ user_id: user.id });

      if (sessionErr || !sessionData) {
        return errorResponse("Failed to create session", 500);
      }

      return successResponse({
        trusted: true,
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
        email: user.email,
      });
    }

    // Untrusted device — needs OTP
    return successResponse({
      trusted: false,
      email: user.email,
      message: "OTP required for new device",
    });

  } catch (err) {
    console.error("pin-login error:", err);
    return errorResponse("Internal server error", 500);
  }
});