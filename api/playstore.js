/**
 * Serverless API Endpoint untuk Scraping Metadata, Versi, Gambar & Tag Kategori Play Store
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
    let tags = [];

    // 1. Ekstraksi Judul Game
    const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i);
    if (ogTitleMatch) {
      title = ogTitleMatch[1].replace(/\s*-\s*Apps on Google Play.*/i, '').replace(/\s*-\s*Aplikasi di Google Play.*/i, '').trim();
    }

    // 2. Ekstraksi Gambar Ikon HD Google Play Store
    const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
    const imgTagMatch = html.match(/<img [^>]*src="(https:\/\/play-lh\.googleusercontent\.com\/[^"]+)"/i) || html.match(/<img [^>]*src="(https:\/\/[^"]*googleusercontent\.com[^"]+)"/i);
    
    if (ogImageMatch && ogImageMatch[1]) {
      image = ogImageMatch[1].replace(/&amp;/g, '&');
    } else if (imgTagMatch && imgTagMatch[1]) {
      image = imgTagMatch[1].replace(/&amp;/g, '&');
    }

    if (image && image.includes('googleusercontent.com')) {
      image = image.split('=')[0] + '=s512';
    }

    // 3. Ekstraksi Versi Play Store (Multi-pattern Regex)
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
    if (jsonLdMatch) {
      for (const block of jsonLdMatch) {
        try {
          const raw = block.replace(/<script type="application\/ld\+json">/i, '').replace(/<\/script>/i, '').trim();
          const parsed = JSON.parse(raw);
          if (parsed.softwareVersion) {
            version = parsed.softwareVersion;
          }
          if (!image && parsed.image) {
            image = typeof parsed.image === 'string' ? parsed.image : (parsed.image.url || image);
            if (image && image.includes('googleusercontent.com')) image = image.split('=')[0] + '=s512';
          }
        } catch (e) {}
      }
    }

    if (!version) {
      const verRegexes = [
        /\[\[\["(\d+\.\d+[\.\d]*)"\]/i,
        /"softwareVersion"\s*:\s*"([^"]+)"/i,
        /\["(\d+\.\d+\.\d+[\.\d]*)"\]/i,
        /\[\["(\d+\.\d+[\.\d]*)"\]/i,
        /AF_initDataCallback[\s\S]*?\[\[\["(\d+\.\d+[\.\d]*)"/i
      ];

      for (const reg of verRegexes) {
        const m = html.match(reg);
        if (m && m[1] && m[1].length < 15) {
          version = m[1];
          break;
        }
      }
    }

    // 4. Ekstraksi Tag Chips Asli Play Store
    const chipLinkRegexp = /<a[^>]*href="\/store\/apps\/(?:category|topic)[^"]*"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/gi;
    let matchChipLink;
    while ((matchChipLink = chipLinkRegexp.exec(html)) !== null) {
      const chipText = matchChipLink[1].trim();
      if (chipText && 
          chipText.length > 1 && 
          chipText.length < 25 && 
          !chipText.includes('http') && 
          !chipText.toLowerCase().includes('google') &&
          !tags.includes(chipText)) {
        tags.push(chipText);
      }
    }

    tags = tags.slice(0, 6);
    if (tags.length === 0) tags = ['RPG', 'Single player'];

    return res.status(200).json({
      status: 'success',
      title: title || 'Game Mod',
      version: version || '1.0.0',
      image: image || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80',
      tags: tags
    });

  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Terjadi kesalahan saat membaca data Play Store'
    });
  }
};
