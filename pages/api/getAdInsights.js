// pages/api/getAdInsights.js

export const config = { runtime: 'edge' };

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const AD_ACCOUNT_ID = process.env.AD_ACCOUNT_ID;
const API_VERSION = "v22.0";

const LIMIT = 20; // Safe batch size to avoid timeout
const DATE_PRESET = "last_7d"; // Increased date range to 7 days

let supabase;
try {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Missing Supabase credentials.");
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (err) {
  console.error("❌ Supabase Error:", err.message);
}

function errorResponse(message, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Fetch thumbnails with pagination (safe limit)
async function fetchAdsThumbnails() {
  const thumbnails = {};
  let url = `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/ads?` +
    new URLSearchParams({
      access_token: META_ACCESS_TOKEN,
      fields: "id,creative{thumbnail_url}",
      limit: LIMIT.toString()
    });

  let fetchCount = 0;
  while (url && fetchCount < 5) { // safety cap at 100 total ads
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      console.error("Ads API Error:", data);
      throw new Error("Error fetching ads thumbnails");
    }

    data.data.forEach(ad => {
      thumbnails[ad.id] = ad.creative?.thumbnail_url || null;
    });

    url = data.paging?.next || null;
    fetchCount++;
  }

  return thumbnails;
}

export default async function handler(req) {
  if (req.method !== 'GET') return errorResponse("Only GET allowed", 405);
  if (!META_ACCESS_TOKEN || !AD_ACCOUNT_ID) return errorResponse("Missing env vars.");

  const insightsUrl = `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/insights?` +
    new URLSearchParams({
      access_token: META_ACCESS_TOKEN,
      fields: "date_start,date_stop,ad_id,ad_name,impressions,reach,clicks,ctr,spend,actions",
      level: "ad",
      date_preset: DATE_PRESET,
      time_increment: "1",
      limit: LIMIT.toString()
    });

  try {
    const insightsRes = await fetch(insightsUrl);
    const insightsData = await insightsRes.json();

    if (!insightsRes.ok) {
      console.error("Insights API Error:", insightsData);
      return errorResponse("Insights fetch failed", insightsRes.status);
    }

    if (!insightsData.data || insightsData.data.length === 0) {
      return new Response(JSON.stringify({ message: "No data returned.", data: [] }), { status: 200 });
    }

    const thumbnails = await fetchAdsThumbnails();

    const adData = insightsData.data.map((ad) => {
      const impressions = parseInt(ad.impressions) || 0;
      const clicks = parseInt(ad.clicks) || 0;
      const spend = parseFloat(ad.spend) || 0;
      const ctr = parseFloat(ad.ctr) || 0;
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
      const cpc = clicks > 0 ? spend / clicks : 0;
      const leads = ad.actions?.find(a => a.action_type === "lead")?.value || 0;
      const purchases = ad.actions?.find(a => a.action_type === "purchase")?.value || 0;
      const cpl = leads > 0 ? spend / leads : 0;
      const cpp = purchases > 0 ? spend / purchases : 0;

      return {
        platform: "Meta",
        ad_id: ad.ad_id,
        ad_name: ad.ad_name,
        date_start: ad.date_start,
        date_stop: ad.date_stop,
        impressions,
        reach: parseInt(ad.reach) || 0,
        clicks,
        spend,
        ctr,
        cpm,
        cpc,
        leads: parseInt(leads),
        purchases: parseInt(purchases),
        cpl,
        cpp,
        thumbnail_url: thumbnails[ad.ad_id] || null
      };
    });

    const { error } = await supabase
      .from("ad_insights")
      .upsert(adData, { onConflict: "ad_id,date_start,date_stop" });

    if (error) return errorResponse(`Supabase Error: ${error.message}`);

    return new Response(JSON.stringify({ message: "7-day insights & thumbnails saved!" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("❌ Error:", err.message);
    return errorResponse(err.message);
  }
}

