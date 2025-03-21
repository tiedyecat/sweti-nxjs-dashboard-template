// pages/api/getAdsetInsights.js

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const AD_ACCOUNT_ID = process.env.AD_ACCOUNT_ID; // e.g., "act_1234567890"

// 1) Just define the version here:
const API_VERSION = "v22.0"; // or environment variable if you prefer

// 2) Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: "Only GET requests allowed" });
  }

  try {
    // 3) Use that version in your URL
    const insightsResponse = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/insights`,
      {
        params: {
          access_token: META_ACCESS_TOKEN,
          fields: "date_start,date_stop,adset_id,adset_name,impressions,reach,clicks,ctr,spend,actions",
          level: "adset",
          date_preset: "last_30d",
          time_increment: 1
        }
      }
    );

    // ...rest of your code...
  } catch (error) {
    // ...error handling...
  }
}
