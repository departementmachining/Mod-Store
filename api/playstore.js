/**
 * Serverless API Endpoint untuk Scraping Metadata & Versi Play Store
 * Path: /api/playstore.js
 */

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ status: 'error', message: 'URL Google Play Store wajib diisi' });
  }

  try {
    const targetUrl = url.trim() + (url.includes('?') ? '&' : '?') + 'hl=en&gl=US';
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`Gagal menghubungi Play Store. Status: ${response.status}`);
    }

    const html = await response.text();

    let title = '';
    let version = '';
    let image = '';

    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
    if (jsonLdMatch) {
      for (const block of jsonLdMatch) {
        try {
          const raw = block.replace(/<script type="application\/ld\+json">/i, '').replace(/<\/script>/i, '').trim();
          const parsed = JSON.parse(raw);
          if (parsed['@type'] === 'SoftwareApplication' || parsed.softwareVersion) {
            title = parsed.name || title;
            version = parsed.softwareVersion || version;
            image = parsed.image || image;
            break;
          }
        } catch (e) {
          // Continue fallback
        }
      }
    }

    if (!title) {
      const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) {
        title = titleMatch[1]
          .replace(/\s*-\s*Apps on Google Play.*/i, '')
          .replace(/\s*-\s*Aplikasi di Google Play.*/i, '')
          .trim();
      }
    }

    if (!image) {
      const imgMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
      if (imgMatch) image = imgMatch[1];
    }

    if (!version) {
      const verMatch = html.match(/\[\[\["(\d+\.\d+[\.\d]*)"\]/) ||
                       html.match(/"softwareVersion"\s*:\s*"([^"]+)"/i) ||
                       html.match(/Version\s*(\d+\.\d+[\.\d]*)/i) ||
                       html.match(/v?(\d+\.\d+\.\d+|\d+\.\d+)/);
      if (verMatch && verMatch[1]) {
        version = verMatch[1].trim();
      }
    }

    if (image && image.includes('googleusercontent.com')) {
      image = image.replace(/=w\d+-h\d+.*$/, '=s512').replace(/=s\d+.*$/, '=s512');
    }

    return res.status(200).json({
      status: 'success',
      title: title || 'Game Mod',
      version: version || '1.0.0',
      image: image || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80'
    });

  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Terjadi kesalahan saat membaca data Play Store'
    });
  }
};