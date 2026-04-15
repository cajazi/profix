import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  successResponse,
  getAuthUser,
  logAudit,
  sendNotification,
} from "../_shared/utils.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const db = createServiceClient();
  let userId: string | undefined;

  try {
    const user = await getAuthUser(req);
    if (!user) return errorResponse("Unauthorized", 401);
    userId = user.id;

    const body: {
      full_name: string;
      date_of_birth: string;
      id_type: "nin" | "bvn" | "passport" | "drivers_license";
      id_number: string;
      selfie_url?: string;
      id_front_url?: string;
      id_back_url?: string;
    } = await req.json();

    const {
      full_name,
      date_of_birth,
      id_type,
      id_number,
      selfie_url,
      id_front_url,
      id_back_url,
    } = body;

    // Validate required fields
    if (!full_name) return errorResponse("full_name required");
    if (!date_of_birth) return errorResponse("date_of_birth required");
    if (!id_type) return errorResponse("id_type required");
    if (!id_number) return errorResponse("id_number required");

    // Validate id_type
    const validIdTypes = ["nin", "bvn", "passport", "drivers_license"];
    if (!validIdTypes.includes(id_type)) {
      return errorResponse(
        "id_type must be: nin, bvn, passport, or drivers_license"
      );
    }

    // Validate NIN format (11 digits)
    if (id_type === "nin" && !/^\d{11}$/.test(id_number)) {
      return errorResponse("NIN must be exactly 11 digits");
    }

    // Validate BVN format (11 digits)
    if (id_type === "bvn" && !/^\d{11}$/.test(id_number)) {
      return errorResponse("BVN must be exactly 11 digits");
    }

    // Get user profile
    const { data: profile } = await db
      .from("users")
      .select("kyc_level, kyc_status, is_banned")
      .eq("id", userId)
      .single();

    if (!profile) return errorResponse("User not found", 404);
    if (profile.is_banned) return errorResponse("Account suspended", 403);

    // Check existing KYC
    const { data: existingKyc } = await db
      .from("kyc_verifications")
      .select("id, status")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingKyc?.status === "verified") {
      return errorResponse("KYC already verified", 409);
    }

    if (existingKyc?.status === "pending") {
      return errorResponse(
        "KYC verification already pending. Please wait for review.",
        409
      );
    }

    // Upsert KYC record
    const { data: kyc, error: kycErr } = await db
      .from("kyc_verifications")
      .upsert({
        user_id: userId,
        provider: "manual",
        status: "pending",
        level: 1,
        full_name,
        date_of_birth,
        id_type,
        id_number,
        selfie_url: selfie_url || null,
        id_front_url: id_front_url || null,
        id_back_url: id_back_url || null,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (kycErr) throw new Error(kycErr.message);

    // Update user KYC status
    await db
      .from("users")
      .update({
        kyc_status: "pending",
      })
      .eq("id", userId);

    // Notify user
    await sendNotification(db, {
      user_id: userId,
      type: "contract_created",
      title: "KYC Submitted ✅",
      body: "Your KYC documents have been submitted. We will review within 24 hours.",
      data: { kyc_id: kyc.id },
      action_url: `/profile`,
    });

    // Notify admins
    const { data: admins } = await db
      .from("users")
      .select("id")
      .eq("role", "admin");

    if (admins && admins.length > 0) {
      for (const admin of admins) {
        await sendNotification(db, {
          user_id: admin.id,
          type: "contract_created",
          title: "New KYC Submission",
          body: `User ${userId} submitted KYC for review.`,
          data: { kyc_id: kyc.id, user_id: userId },
          action_url: `/admin/kyc/${kyc.id}`,
        });
      }
    }

    await logAudit(db, {
      user_id: userId,
      action: "kyc_submitted",
      table_name: "kyc_verifications",
      record_id: kyc.id,
      new_data: { id_type, status: "pending" },
      edge_fn_name: "submit-kyc",
    });

    return successResponse(
      {
        kyc_id: kyc.id,
        status: "pending",
        message:
          "KYC submitted successfully. Review takes up to 24 hours.",
      },
      201
    );
  } catch (err) {
    await logAudit(db, {
      user_id: userId,
      action: "kyc_submission_failed",
      edge_fn_name: "submit-kyc",
      success: false,
      error_msg: (err as Error).message,
    });
    return errorResponse("Internal server error", 500);
  }
});