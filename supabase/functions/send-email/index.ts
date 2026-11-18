// ============================================================================
// NOTARIX — Transactional Email Edge Function (Deno Runtime)
// Sends branded client email notifications via Resend with deduplication,
// audit logging in email_logs, and graceful error handling.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface EmailPayload {
  eventType: string;
  userId?: string;
  clientEmail: string;
  clientName: string;
  referenceNo: string;
  documentType?: string;
  status?: string;
  previousStatus?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  previousDate?: string;
  previousTime?: string;
  remarks?: string;
  uniqueEventKey: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const emailFrom = Deno.env.get("EMAIL_FROM") || "NOTARIX Office <onboarding@resend.dev>";
    const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://notairum.netlify.app";

    const payload: EmailPayload = await req.json();

    if (!payload.clientEmail || !payload.referenceNo || !payload.uniqueEventKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: clientEmail, referenceNo, uniqueEventKey",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. DEDUPLICATION: Check if email was already successfully sent
    const { data: existingLog } = await supabase
      .from("email_logs")
      .select("id, email_status, provider_message_id")
      .eq("unique_event_key", payload.uniqueEventKey)
      .maybeSingle();

    if (existingLog && (existingLog.email_status === "accepted" || existingLog.email_status === "delivered")) {
      return new Response(
        JSON.stringify({
          success: true,
          status: "already_sent",
          providerId: existingLog.provider_message_id,
          message: "Email was already sent for this event (idempotent skip).",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. BUILD SUBJECT & EMAIL CONTENT
    const { subject, html } = buildEmailTemplate(payload, siteUrl);

    // 3. CREATE / UPDATE EMAIL LOG RECORD (Status: pending)
    let logId = existingLog?.id;
    if (logId) {
      await supabase
        .from("email_logs")
        .update({
          subject,
          email_status: "pending",
          attempt_count: (existingLog as any).attempt_count ? (existingLog as any).attempt_count + 1 : 1,
        })
        .eq("id", logId);
    } else {
      const { data: inserted } = await supabase
        .from("email_logs")
        .insert({
          user_id: payload.userId || null,
          recipient_email: payload.clientEmail,
          recipient_name: payload.clientName || "",
          event_type: payload.eventType,
          related_record_id: payload.referenceNo,
          unique_event_key: payload.uniqueEventKey,
          subject,
          email_status: "pending",
          attempt_count: 1,
        })
        .select("id")
        .single();
      logId = inserted?.id;
    }

    // 4. CHECK IF RESEND API KEY IS CONFIGURED
    if (!resendApiKey) {
      const pendingMsg =
        "Email queued in database. To deliver live emails, add the RESEND_API_KEY secret in your Supabase Dashboard.";
      if (logId) {
        await supabase
          .from("email_logs")
          .update({ error_message: "RESEND_API_KEY not configured in Supabase Secrets." })
          .eq("id", logId);
      }
      return new Response(
        JSON.stringify({
          success: false,
          status: "pending",
          message: pendingMsg,
          logId,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. SEND VIA RESEND API
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [payload.clientEmail],
        subject,
        html,
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      const errMsg = resendData?.message || "Resend API error";
      if (logId) {
        await supabase
          .from("email_logs")
          .update({
            email_status: "failed",
            error_message: errMsg,
          })
          .eq("id", logId);
      }
      return new Response(
        JSON.stringify({
          success: false,
          status: "failed",
          error: errMsg,
          message: `Email sending failed: ${errMsg}`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. RECORD SUCCESSFUL ACCEPTANCE
    const providerId = resendData?.id || "";
    if (logId) {
      await supabase
        .from("email_logs")
        .update({
          email_status: "accepted",
          provider_message_id: providerId,
          error_message: null,
          sent_at: new Date().toISOString(),
        })
        .eq("id", logId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: "accepted",
        providerId,
        message: "Email successfully accepted by transactional email provider.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({
        success: false,
        status: "failed",
        error: errorMsg,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Builds responsive, branded HTML email for NOTARIX clients.
 */
function buildEmailTemplate(p: EmailPayload, siteUrl: string): { subject: string; html: string } {
  let badgeColor = "#059669"; // Green
  let badgeText = "Status Update";
  let eventHeadline = "Notification regarding your appointment";

  switch (p.eventType) {
    case "appointment_submitted":
      badgeColor = "#d97706";
      badgeText = "Submitted";
      eventHeadline = "Your appointment request has been received";
      break;
    case "appointment_approved":
      badgeColor = "#059669";
      badgeText = "Approved";
      eventHeadline = "Your appointment has been approved";
      break;
    case "appointment_rejected":
      badgeColor = "#dc2626";
      badgeText = "Rejected";
      eventHeadline = "Appointment request status update";
      break;
    case "appointment_rescheduled":
      badgeColor = "#2563eb";
      badgeText = "Rescheduled";
      eventHeadline = "Your appointment has been rescheduled";
      break;
    case "appointment_completed":
      badgeColor = "#12332b";
      badgeText = "Completed";
      eventHeadline = "Your appointment has been completed";
      break;
    case "appointment_cancelled":
      badgeColor = "#64748b";
      badgeText = "Cancelled";
      eventHeadline = "Your appointment has been cancelled";
      break;
    case "document_request_submitted":
    case "document_request_under_review":
    case "document_request_additional_requirements":
    case "document_request_processing":
    case "document_request_ready_for_release":
    case "document_request_completed":
    case "document_request_rejected":
      badgeColor = "#d97706";
      badgeText = "Document Request";
      eventHeadline = `Document Request update: ${p.status || "Status Updated"}`;
      break;
  }

  const subject = `[NOTARIX] ${badgeText}: ${p.referenceNo} - ${p.documentType || "Notarial Service"}`;
  const portalLink = `${siteUrl}/portal/appointments`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f6f8f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; }
    .wrapper { width: 100%; table-layout: fixed; background-color: #f6f8f7; padding: 30px 10px; }
    .main { background: #ffffff; margin: 0 auto; width: 100%; max-width: 580px; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 16px rgba(18, 51, 43, 0.06); }
    .header { background: #12332b; padding: 28px 24px 22px; text-align: center; border-bottom: 3px solid #c9a544; }
    .brand-title { color: #ffffff; font-family: Georgia, 'Playfair Display', serif; font-size: 24px; font-weight: bold; letter-spacing: 0.16em; margin: 0; text-transform: uppercase; }
    .brand-sub { color: #d5ae4f; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; margin: 4px 0 0; font-weight: 600; }
    .body { padding: 30px 28px 24px; }
    .badge { display: inline-block; background-color: ${badgeColor}; color: #ffffff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; padding: 4px 12px; border-radius: 999px; margin-bottom: 12px; }
    .headline { font-size: 19px; font-weight: 700; color: #0f172a; margin: 0 0 16px; line-height: 1.35; }
    .greeting { font-size: 14.5px; line-height: 1.6; color: #334155; margin-bottom: 20px; }
    .card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px 20px; margin: 20px 0; }
    .card-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #edf2f7; font-size: 13.5px; }
    .card-row:last-child { border-bottom: none; padding-bottom: 0; }
    .card-label { color: #64748b; font-weight: 600; }
    .card-value { color: #0f172a; font-weight: 700; text-align: right; }
    .ref-code { font-family: monospace; font-size: 14px; color: #12332b; background: #e6ede8; padding: 2px 6px; border-radius: 4px; }
    .remarks-box { background-color: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #d97706; padding: 12px 16px; border-radius: 6px; margin: 18px 0; font-size: 13.5px; color: #92400e; line-height: 1.5; }
    .cta-wrap { text-align: center; margin: 28px 0 16px; }
    .btn { display: inline-block; background-color: #12332b; color: #ffffff !important; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 28px; border-radius: 8px; border: 1px solid #12332b; }
    .footer { background-color: #f1f5f9; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; line-height: 1.6; border-top: 1px solid #e2e8f0; }
    .footer strong { color: #334155; }
    .footer a { color: #12332b; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="wrapper">
    <table class="main" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td class="header">
          <h1 class="brand-title">NOTARIX</h1>
          <p class="brand-sub">Palasan Law Office &bull; Notarization Records</p>
        </td>
      </tr>
      <tr>
        <td class="body">
          <span class="badge">${badgeText}</span>
          <h2 class="headline">${eventHeadline}</h2>
          <p class="greeting">
            Dear <strong>${escapeHtml(p.clientName || "Valued Client")}</strong>,
          </p>
          <p class="greeting">
            This is an automated notification regarding your appointment request at <strong>Palasan Law Office</strong>.
          </p>

          <div class="card">
            <table width="100%" cellpadding="6" cellspacing="0" style="font-size:13.5px;">
              <tr>
                <td style="color:#64748b; font-weight:600;">Reference No.</td>
                <td align="right"><span class="ref-code">${escapeHtml(p.referenceNo)}</span></td>
              </tr>
              <tr>
                <td style="color:#64748b; font-weight:600;">Document / Service</td>
                <td align="right" style="font-weight:700; color:#0f172a;">${escapeHtml(p.documentType || "Notarial Service")}</td>
              </tr>
              <tr>
                <td style="color:#64748b; font-weight:600;">Current Status</td>
                <td align="right"><strong style="color:${badgeColor};">${escapeHtml(p.status || badgeText)}</strong></td>
              </tr>
              ${
                p.appointmentDate
                  ? `<tr>
                <td style="color:#64748b; font-weight:600;">Schedule Date & Time</td>
                <td align="right" style="font-weight:700; color:#0f172a;">${escapeHtml(p.appointmentDate)}${p.appointmentTime ? " at " + escapeHtml(p.appointmentTime) : ""}</td>
              </tr>`
                  : ""
              }
              ${
                p.previousDate
                  ? `<tr>
                <td style="color:#64748b; font-weight:600;">Previous Schedule</td>
                <td align="right" style="color:#94a3b8; text-decoration:line-through;">${escapeHtml(p.previousDate)}${p.previousTime ? " at " + escapeHtml(p.previousTime) : ""}</td>
              </tr>`
                  : ""
              }
            </table>
          </div>

          ${
            p.remarks
              ? `<div class="remarks-box">
            <strong>Office Remarks / Reason:</strong><br>
            ${escapeHtml(p.remarks)}
          </div>`
              : ""
          }

          <div class="cta-wrap">
            <a class="btn" href="${portalLink}" target="_blank">View in Notarix Client Portal</a>
          </div>

          <p style="font-size:12.5px; color:#64748b; line-height:1.5; margin-top:22px;">
            Please arrive 10 minutes before your scheduled appointment time and bring your original valid government-issued ID and all document copies.
          </p>
        </td>
      </tr>
      <tr>
        <td class="footer">
          <strong>Palasan Law Office</strong> &bull; Cagayan de Oro City, Philippines<br>
          Email: <a href="mailto:palasanlawoffice@gmail.com">palasanlawoffice@gmail.com</a> &bull; Tel: (088) 857-4123<br>
          <span style="font-size:11px; color:#94a3b8; display:inline-block; margin-top:8px;">
            This is an automated notification from the NOTARIX appointment system. Please do not reply directly to this email.
          </span>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>
  `.trim();

  return { subject, html };
}

function escapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
