import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const AD_ACCOUNT_ID = process.env.AD_ACCOUNT_ID; // e.g., "act_1234567890"
const API_VERSION = "v18.0"; // Use latest stable version

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: "Only GET requests allowed" });
    }

    try {
        // 🚀 Fetch data from Meta Ads API
        const response = await axios.get(
            `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/insights`,
            {
                params: {
                    access_token: META_ACCESS_TOKEN,
                    fields: "campaign_name,ad_name,impressions,reach,clicks,spend,ctr,cpc,cpm,actions",
                    level: "ad",
                    date_preset: "last_7d", // Adjust as needed
                }
            }
        );

        // 🚀 Clean and map data for Supabase
        const adsData = response.data.data.map(ad => ({
            platform: "Meta",
            campaign_name: ad.campaign_name || "Unknown",
            ad_name: ad.ad_name || "Unknown",
            location: null,
            impressions: parseInt(ad.impressions) || 0,
            reach: parseInt(ad.reach) || 0,
            clicks: parseInt(ad.clicks) || 0,
            spend: parseFloat(ad.spend) || 0,
            ctr: parseFloat(ad.ctr) || 0,  // ✅ Using Meta’s direct value
            cpm: parseFloat(ad.cpm) || 0,  // ✅ Using Meta’s direct value
            cpc: parseFloat(ad.cpc) || 0,  // ✅ Using Meta’s direct value
            leads: ad.actions?.find(action => action.action_type === "lead")?.value || 0,
            memberships: ad.actions?.find(action => action.action_type === "offsite_conversion.custom")?.value || 0,
            roas: 0,  // Placeholder, needs revenue data
            roi: 0,   // Placeholder
            date: new Date().toISOString().split("T")[0]
        }));

        // 🚀 Insert data into Supabase
        const { data, error } = await supabase.from("ad_data").insert(adsData);
        if (error) throw error;

        return res.status(200).json({ message: "Meta data saved to Supabase!", data });

    } catch (error) {
        console.error("Meta API Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
