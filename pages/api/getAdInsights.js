// pages/api/getAdInsights.js

export const config = {
  runtime: 'edge', // Use Edge Runtime
};

import { createClient } from '@supabase/supabase-js';

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const AD_ACCOUNT_ID = process.env.AD_ACCOUNT_ID; // e.g., "act_1234567890"
const API_VERSION = "v22.0"; // Adjust as needed

// Initialize Supabase client
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
  // Only allow GET requests
  if (req.method !== 'GET') {
    return errorResponse("Only GET requests allowed", 405);
  }

  // Check critical environment variables
  if (!META_ACCESS_TOKEN || !AD_ACCOUNT_ID) {
    return errorResponse("Missing Meta environment variables (META_ACCESS_TOKEN or AD_ACCOUNT_ID).");
  }

  // Construct the Meta Graph API URL
  const metaUrl = `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/insights?` +
    new URLSearchParams({
      access_token: META_ACCESS_TOKEN,
      fields: "date_start,date_stop,ad_id,ad_name,impressions,reach,clicks,ctr,spend,actions",
      level: "ad",
      date_preset: "last_30d",
      time_increment: "1"
    });

  try {
    // Fetch from the Meta API
    const metaRes = await fetch(metaUrl);
    const insightsResponse = await metaRes.json();

    if (!metaRes.ok) {
      console.error("Meta API Error details:", insightsResponse);
      return errorResponse(`Meta API returned status: ${metaRes.status} - ${JSON.stringify(insightsResponse)}`, metaRes.status);
    }

    console.log("📊 Raw Meta API Response:", insightsResponse);

    // Exit early if no data returned
    if (!insightsResponse.data || insightsResponse.data.length === 0) {
      console.warn("⚠️ No ad data returned from Meta API.");
      return new Response(JSON.stringify({ message: "No ad data returned from Meta API.", data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Process and clean the data
    const adData = insightsResponse.data.map((ad) => {
      if (!ad.ad_id) {
        console.error("❌ Missing ad_id for one of the insights:", ad);
      }
      if (!ad.date_start || !ad.date_stop) {
        console.error("❌ Missing date_start or date_stop for ad:", ad.ad_id);
      }
      if (!ad.impressions) {
        console.warn("⚠️ No impressions found for ad:", ad.ad_id);
      }
      if (!ad.spend) {
        console.warn("⚠️ No spend found for ad:", ad.ad_id);
      }

      const impressions = parseInt(ad.impressions) || 0;
      const clicks = parseInt(ad.clicks) || 0;
      const spend = parseFloat(ad.spend) || 0;
      const ctr = parseFloat(ad.ctr) || 0;
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
      const cpc = clicks > 0 ? spend / clicks : 0;

      // Standard events
      const leadsValue = ad.actions?.find((a) => a.action_type === "lead")?.value || 0;
      const purchasesValue = ad.actions?.find((a) => a.action_type === "purchase")?.value || 0;

      // Compute cost metrics safely
      const cpl = leadsValue > 0 ? spend / leadsValue : 0;
      const cpp = purchasesValue > 0 ? spend / purchasesValue : 0;

      return {
        platform: "Meta",
        ad_id: ad.ad_id || "Unknown",
        ad_name: ad.ad_name || "Unknown",
        date_start: ad.date_start,
        date_stop: ad.date_stop,
        impressions,
        reach: parseInt(ad.reach) || 0,
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

    console.log("🧾 Cleaned Ad Data:", adData);

    // Upsert the data into the ad_insights table using a composite unique key
    const { data, error } = await supabase
      .from("ad_insights")
      .upsert(adData, { onConflict: "ad_id,date_start,date_stop" })
      .select("*");

    if (error) {
      return errorResponse(`Supabase Insert Error: ${error.message}`);
    }

    // Return success response
    return new Response(JSON.stringify({ message: "Ad data saved to Supabase!", data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("❌ Meta API Fetch Error:", err.message);
    return errorResponse(err.message);
  }
}

