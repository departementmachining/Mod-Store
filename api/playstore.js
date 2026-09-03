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

    // 1. Ekstraksi dari JSON-LD (Metadata Utama Google)
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
    if (jsonLdMatch) {
      for (const block of jsonLdMatch) {
        try {
          const raw = block.replace(/<script type="application\/ld\+json">/i, '').replace(/<\/script>/i, '').trim();
          const parsed = JSON.parse(raw);
          if (parsed['@type'] === 'SoftwareApplication' || parsed.softwareVersion || parsed.image || parsed.applicationCategory) {
            title = parsed.name || title;
            version = parsed.softwareVersion || version;
            if (parsed.image) {
              image = typeof parsed.image === 'string' ? parsed.image : (parsed.image.url || image);
            }

            // Ambik Kategori / Genre dari JSON-LD
            if (parsed.applicationCategory) {
              let cat = parsed.applicationCategory.replace(/^GAME_/i, '').replace(/_/g, ' ');
              cat = cat.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
              if (cat && !tags.includes(cat)) tags.push(cat);
            }
            if (parsed.genre) {
              if (Array.isArray(parsed.genre)) {
                parsed.genre.forEach(g => { if (g && !tags.includes(g)) tags.push(g); });
              } else if (typeof parsed.genre === 'string' && !tags.includes(parsed.genre)) {
                tags.push(parsed.genre);
              }
            }
    // 2. Ekstraksi Genre / Tag / Topic Chips dari HTML Play Store
    const genreRegexp = /itemprop="genre"[^>]*>([^<]+)</gi;
    let matchGenre;
    while ((matchGenre = genreRegexp.exec(html)) !== null) {
      const g = matchGenre[1].trim();
      if (g && !tags.includes(g)) tags.push(g);
    }

    // Ekstraksisemua chip tag (Category, Topic, Sub-genre) dari link Play Store
    const chipLinkRegexp = /<a[^>]*href="\/store\/apps\/(?:category|topic|stream|search)[^"]*"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/gi;
    let matchChipLink;
    while ((matchChipLink = chipLinkRegexp.exec(html)) !== null) {
      const chipText = matchChipLink[1].trim();
      if (chipText && 
          chipText.length > 1 && 
          chipText.length < 30 && 
          !chipText.includes('http') && 
          !chipText.toLowerCase().includes('google') &&
          !tags.includes(chipText)) {
        tags.push(chipText);
      }
    }

    // 3. Fallback Judul
    if (!title) {
      const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) {
        title = titleMatch[1]
          .replace(/\s*-\s*Apps on Google Play.*/i, '')
          .replace(/\s*-\s*Aplikasi di Google Play.*/i, '')
          .trim();
      }
    }

    // 4. Fallback Gambar Ikon / Banner Play Store (HD Resolution)
    if (!image) {
      const imgMatch = html.match(/<meta property="og:image" content="([^"]+)"/i) || 
                       html.match(/<meta name="twitter:image" content="([^"]+)"/i) ||
                       html.match(/<img [^>]*src="([^"]+googleusercontent\.com[^"]+)"/i);
      if (imgMatch) image = imgMatch[1];
    }

    if (image) {
      image = image.replace(/&amp;/g, '&');
      if (image.includes('googleusercontent.com')) {
        image = image.split('=')[0] + '=s512';
      }
    }

    // 5. Fallback Versi Play Store
    if (!version) {
      const verMatch = html.match(/\[\[\["(\d+\.\d+[\.\d]*)"\]/) ||
                       html.match(/"softwareVersion"\s*:\s*"([^"]+)"/i) ||
    // 6. Detection Kata Kunci Genre jika tags masih kosong atau kurang
    const combinedText = (title + ' ' + html).toLowerCase();
    const knownGenres = [
      'RPG', 'Role Playing', 'Monster', 'Single player', 'Single Player', 
      'Roguelike', 'Immersive', 'Stylized', 'Bergaya unik', 'Action RPG', 
      'Strategy', 'Tower Defense', 'Idle RPG', 'Simulation', 'Anime', 
      'Casual', 'PvP', 'Offline', 'Co-op'
    ];
    knownGenres.forEach(kg => {
      if (combinedText.includes(kg.toLowerCase())) {
        // Normalisasi kapitalisasi
        const formattedTag = kg === 'Bergaya unik' ? 'Stylized' : kg;
        if (!tags.some(t => t.toLowerCase() === formattedTag.toLowerCase())) {
          tags.push(formattedTag);
        }
      }
    });

    if (tags.length === 0) {
      tags = ['RPG', 'Single player'];
    }

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
