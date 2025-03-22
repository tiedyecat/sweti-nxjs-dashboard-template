// pages/api/getAdInsights.js

export const config = {
  runtime: 'edge',
};

import { createClient } from '@supabase/supabase-js';

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const AD_ACCOUNT_ID = process.env.AD_ACCOUNT_ID;
const API_VERSION = "v22.0";

// Initialize Supabase
let supabase;
try {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Missing Supabase credentials (SUPABASE_URL or SUPABASE_KEY).");
  }
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (err) {
  console.error("❌ Supabase Error:", err.message);
}

// Error helper
function errorResponse(message, status = 500) {
  console.error("❌ Error:", message);
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async function handler(req) {
  if (req.method !== 'GET') {
    return errorResponse("Only GET requests allowed", 405);
  }

  if (!META_ACCESS_TOKEN || !AD_ACCOUNT_ID) {
    return errorResponse("Missing META_ACCESS_TOKEN or AD_ACCOUNT_ID.");
  }

  const thumbWidth = 1920;
  const thumbHeight = 1080;

  const metaUrl = `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/insights?` +
    new URLSearchParams({
      access_token: META_ACCESS_TOKEN,
      fields: `date_start,date_stop,ad_id,ad_name,impressions,reach,clicks,ctr,spend,actions,ad_creative{thumbnail_url,thumbnail_width=${thumbWidth},thumbnail_height=${thumbHeight}}`,
      level: "ad",
      date_preset: "last_30d",
      time_increment: "1"
    });

  try {
    const metaRes = await fetch(metaUrl);
    const insightsResponse = await metaRes.json();

    if (!metaRes.ok) {
      console.error("Meta API Error details:", insightsResponse);
      return errorResponse(`Meta API Error: ${metaRes.status}`, metaRes.status);
    }

    console.log("📊 Meta API Response:", insightsResponse);

    if (!insightsResponse.data || insightsResponse.data.length === 0) {
      console.warn("⚠️ No ad data returned.");
      return new Response(JSON.stringify({ message: "No data returned.", data: [] }), { status: 200 });
    }

    const adData = insightsResponse.data.map((ad) => {
      const impressions = parseInt(ad.impressions) || 0;
      const clicks = parseInt(ad.clicks) || 0;
      const spend = parseFloat(ad.spend) || 0;
      const ctr = parseFloat(ad.ctr) || 0;
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
      const cpc = clicks > 0 ? spend / clicks : 0;

      const leadsValue = ad.actions?.find((a) => a.action_type === "lead")?.value || 0;
      const purchasesValue = ad.actions?.find((a) => a.action_type === "purchase")?.value || 0;

      const cpl = leadsValue > 0 ? spend / leadsValue : 0;
      const cpp = purchasesValue > 0 ? spend / purchasesValue : 0;

      // Thumbnail URL from creative
      const thumbnailUrl = ad.ad_creative?.thumbnail_url || null;

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
        cpp,
        thumbnail_url: thumbnailUrl,
      };
    });

    console.log("🧾 Cleaned Ad Data with Thumbnail:", adData);

    const { data, error } = await supabase
      .from("ad_insights")
      .upsert(adData, { onConflict: "ad_id,date_start,date_stop" })
      .select("*");

    if (error) {
      return errorResponse(`Supabase Error: ${error.message}`);
    }

    return new Response(JSON.stringify({ message: "Ad insights saved!", data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("❌ Meta API Fetch Error:", err.message);
    return errorResponse(err.message);
  }
}

