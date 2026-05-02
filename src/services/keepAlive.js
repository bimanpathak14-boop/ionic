import https from 'https';

/**
 * Keep the Render service alive by pinging its health endpoint.
 * Render free tier sleeps after 15 minutes of inactivity.
 * This script pings the service every 10 minutes.
 */
export const startKeepAlive = () => {
  const url = process.env.RENDER_EXTERNAL_URL || 'https://ionic-04b0.onrender.com';
  
  if (!url) {
    console.log('⚠️ No RENDER_EXTERNAL_URL or fallback URL provided. Keep-alive disabled.');
    return;
  }

  const healthUrl = `${url}/health`;
  console.log(`📡 Keep-alive started. Pinging: ${healthUrl} every 10 minutes.`);

  // Ping immediately on start
  ping(healthUrl);

  // Set interval (10 minutes = 600,000 ms)
  setInterval(() => {
    ping(healthUrl);
  }, 600000);
};

const ping = (url) => {
  https.get(url, (res) => {
    console.log(`🔄 [Keep-Alive] Pinged ${url}. Status: ${res.statusCode}`);
  }).on('error', (err) => {
    console.error(`❌ [Keep-Alive] Ping failed: ${err.message}`);
  });
};
