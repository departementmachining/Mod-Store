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

    // 1. Coba ekstraksi dari JSON-LD
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
    if (jsonLdMatch) {
      for (const block of jsonLdMatch) {
        try {
          const raw = block.replace(/<script type="application\/ld\+json">/i, '').replace(/<\/script>/i, '').trim();
          const parsed = JSON.parse(raw);
          if (parsed['@type'] === 'SoftwareApplication' || parsed.softwareVersion || parsed.image) {
            title = parsed.name || title;
            version = parsed.softwareVersion || version;
            if (parsed.image) {
              image = typeof parsed.image === 'string' ? parsed.image : (parsed.image.url || image);
            }
            break;
          }
        } catch (e) {
          // Fallback parsing
        }
      }
    }

    // 2. Fallback Judul
    if (!title) {
      const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) {
        title = titleMatch[1]
          .replace(/\s*-\s*Apps on Google Play.*/i, '')
          .replace(/\s*-\s*Aplikasi di Google Play.*/i, '')
          .trim();
      }
    }

    // 3. Fallback Gambar Ikon / Banner Play Store
    if (!image) {
      const imgMatch = html.match(/<meta property="og:image" content="([^"]+)"/i) || 
                       html.match(/<meta name="twitter:image" content="([^"]+)"/i) ||
                       html.match(/<img [^>]*src="([^"]+googleusercontent\.com[^"]+)"/i);
      if (imgMatch) image = imgMatch[1];
    }

    // 4. Fallback Versi Play Store
    if (!version) {
      const verMatch = html.match(/\[\[\["(\d+\.\d+[\.\d]*)"\]/) ||
                       html.match(/"softwareVersion"\s*:\s*"([^"]+)"/i) ||
                       html.match(/Version\s*(\d+\.\d+[\.\d]*)/i) ||
                       html.match(/v?(\d+\.\d+\.\d+|\d+\.\d+)/);
      if (verMatch && verMatch[1]) {
        version = verMatch[1].trim();
      }
    }

    // Pembersihan URL Gambar Play Store agar HD dan valid
    if (image) {
      image = image.replace(/&amp;/g, '&');
      if (image.includes('googleusercontent.com')) {
        // Ambil URL dasar sebelum tanda '=' lalu format ke resolusi HD 512px
        image = image.split('=')[0] + '=s512';
      }
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
