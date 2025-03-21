// pages/api/getAdsetInsights.js

export const config = {
  runtime: 'edge', // 1) Tells Next.js to use the Edge Runtime
};

import { createClient } from '@supabase/supabase-js';

// 2) Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const AD_ACCOUNT_ID = process.env.AD_ACCOUNT_ID; // e.g., "act_1234567890"
const API_VERSION = "v22.0"; // If you truly need "v22.0" by 2025

// 3) Initialize Supabase client
//    Make sure you're on a supabase-js version that supports Edge
let supabase;
try {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Missing Supabase credentials (SUPABASE_URL or SUPABASE_KEY).");
  }
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (err) {
  console.error("❌ Supabase Client Initialization Error:", err.message);
}

/**
 * Helper to create an error JSON response with an HTTP status.
 * Usage: return errorResponse("Something went wrong", 400);
 */
function errorResponse(message, status = 500) {
  console.error("❌ Error:", message);
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async function handler(req) {
  // 4) Only allow GET requests
  if (req.method !== 'GET') {
    return errorResponse("Only GET requests allowed", 405);
  }

  // 5) Check critical environment variables
  if (!META_ACCESS_TOKEN || !AD_ACCOUNT_ID) {
    return errorResponse("Missing Meta environment variables (META_ACCESS_TOKEN or AD_ACCOUNT_ID).");
  }

  // 6) Construct the Meta Graph API URL
  const metaUrl = `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/insights?` +
    new URLSearchParams({
      access_token: META_ACCESS_TOKEN,
      fields: "date_start,date_stop,adset_id,adset_name,impressions,reach,clicks,ctr,spend,actions",
      level: "adset",
      date_preset: "last_30d",
      time_increment: "1"
    });

  try {
    // 7) Fetch from the Meta API
    const metaRes = await fetch(metaUrl);
    if (!metaRes.ok) {
      return errorResponse(`Meta API returned non-200 status: ${metaRes.status}`, metaRes.status);
    }

    const insightsResponse = await metaRes.json();
    console.log("📊 Raw Meta API Response:", insightsResponse);

    // 8) Exit early if no data returned
    if (!insightsResponse.data || insightsResponse.data.length === 0) {
      console.warn("⚠️ No ad set data returned from Meta API.");
      return new Response(JSON.stringify({ message: "No ad set data returned from Meta API.", data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 9) Process and clean the data
    const adsetData = insightsResponse.data.map((adset) => {
      if (!adset.adset_id) {
        console.error("❌ Missing adset_id for one of the insights:", adset);
      }
      if (!adset.date_start || !adset.date_stop) {
        console.error("❌ Missing date_start or date_stop for ad set:", adset.adset_id);
      }
      if (!adset.impressions) {
        console.warn("⚠️ No impressions found for ad set:", adset.adset_id);
      }
      if (!adset.spend) {
        console.warn("⚠️ No spend found for ad set:", adset.adset_id);
      }

      const impressions = parseInt(adset.impressions) || 0;
      const clicks = parseInt(adset.clicks) || 0;
      const spend = parseFloat(adset.spend) || 0;
      const ctr = parseFloat(adset.ctr) || 0;
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
      const cpc = clicks > 0 ? spend / clicks : 0;

      // Standard events
      const leadsValue = adset.actions?.find((a) => a.action_type === "lead")?.value || 0;
      const purchasesValue = adset.actions?.find((a) => a.action_type === "purchase")?.value || 0;

      // Compute cost metrics safely
      const cpl = leadsValue > 0 ? spend / leadsValue : 0;
      const cpp = purchasesValue > 0 ? spend / purchasesValue : 0;

      return {
        platform: "Meta",
        adset_id: adset.adset_id || "Unknown",
        adset_name: adset.adset_name || "Unknown",
        date_start: adset.date_start,
        date_stop: adset.date_stop,
        impressions,
        reach: parseInt(adset.reach) || 0,
        clicks,
        spend,
        ctr,
        cpm,
        cpc,
        leads: leadsValue,
        purchases: purchasesValue,
        cpl,
        cpp
      };
    });

    console.log("🧾 Cleaned Ad Set Data:", adsetData);

    // 10) Upsert the data into the adset_data table using a composite unique key
    const { data, error } = await supabase
      .from("adset_data")
      .upsert(adsetData, { onConflict: "adset_id,date_start,date_stop" })
      .select("*");

    if (error) {
      return errorResponse(`Supabase Insert Error: ${error.message}`);
    }

    // 11) Return success response
    return new Response(JSON.stringify({ message: "Ad set data saved to Supabase!", data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("❌ Meta API Error:", err);
    return errorResponse(err.message);
  }
}

