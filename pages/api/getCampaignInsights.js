// pages/api/getCampaignInsights.js

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

// 1. Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const AD_ACCOUNT_ID = process.env.AD_ACCOUNT_ID; // e.g., "act_1234567890"
const API_VERSION = "v22.0"; // Using API version 22.0

// 2. Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: "Only GET requests allowed" });
  }

  try {
    // 3. Fetch Meta Campaign Insights Data
    const insightsResponse = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/insights`,
      {
        params: {
          access_token: META_ACCESS_TOKEN,
          fields: "date_start,date_stop,campaign_id,campaign_name,impressions,reach,clicks,ctr,spend,actions",
          level: "campaign",
          date_preset: "last_30d",
          time_increment: 1
        }
      }
    );

    console.log("📊 Raw Meta API Response:", JSON.stringify(insightsResponse.data, null, 2));

    // 4. Exit early if no data is returned
    if (!insightsResponse.data.data || insightsResponse.data.data.length === 0) {
      return res.status(200).json({ message: "No campaign data returned from Meta API.", data: [] });
    }

    // 5. Process and clean the data
    const campaignsData = insightsResponse.data.data.map(campaign => {
      // Basic checks
      if (!campaign.campaign_id) {
        console.error("Missing campaign_id for one of the insights:", campaign);
      }
      if (!campaign.date_start || !campaign.date_stop) {
        console.error("Missing date_start or date_stop for campaign:", campaign.campaign_id);
      }
      if (!campaign.impressions) {
        console.warn("No impressions found for campaign:", campaign.campaign_id);
      }
      if (!campaign.spend) {
        console.warn("No spend found for campaign:", campaign.campaign_id);
      }
      
      const impressions = parseInt(campaign.impressions) || 0;
      const clicks = parseInt(campaign.clicks) || 0;
      const spend = parseFloat(campaign.spend) || 0;
      const ctr = parseFloat(campaign.ctr) || 0;
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
      const cpc = clicks > 0 ? spend / clicks : 0;
      
      // Standard events
      const leadsValue = campaign.actions?.find(a => a.action_type === "lead")?.value || 0;
      const purchasesValue = campaign.actions?.find(a => a.action_type === "purchase")?.value || 0;
      
      // Compute cost metrics safely
      const cpl = leadsValue > 0 ? spend / leadsValue : 0;
      const cpp = purchasesValue > 0 ? spend / purchasesValue : 0;
      
      return {
        platform: "Meta",
        campaign_id: campaign.campaign_id || "Unknown",
        campaign_name: campaign.campaign_name || "Unknown",
        date_start: campaign.date_start,
        date_stop: campaign.date_stop,
        impressions,
        reach: parseInt(campaign.reach) || 0,
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

    console.log("🧾 Cleaned Campaigns Data:", JSON.stringify(campaignsData, null, 2));

    // 6. Insert the data into the campaign_data table in Supabase
    // Using upsert here (with a unique constraint on campaign_id, date_start, date_stop)
    const { data, error } = await supabase
      .from("campaign_data")
      .upsert(campaignsData, { onConflict: "campaign_id,date_start,date_stop" })
      .select("*");

    if (error) {
      console.error("❌ Supabase Insert Error:", JSON.stringify(error, null, 2));
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ message: "Campaign data saved to Supabase!", data });
  } catch (error) {
    console.error("❌ Meta API Error:", JSON.stringify(error.response?.data || error.message, null, 2));
    return res.status(500).json({ error: error.message });
  }
}
