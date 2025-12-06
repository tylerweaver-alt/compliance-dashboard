import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY;

interface GeocodeResult {
  postId: number;
  postName: string;
  success: boolean;
  lat?: number;
  lng?: number;
  error?: string;
}

/**
 * POST /api/posts/geocode
 * 
 * Geocodes all posts missing lat/lng for a given region.
 * Uses Geoapify Geocoding API.
 * 
 * Body: { regionId: string }
 * Returns: { ok: boolean, results: GeocodeResult[], summary: { total, success, failed } }
 */
export async function POST(req: NextRequest) {
  try {
    if (!GEOAPIFY_API_KEY) {
      return NextResponse.json(
        { ok: false, error: 'GEOAPIFY_API_KEY not configured' },
        { status: 500 }
      );
    }

    let body: { regionId?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const { regionId } = body;
    if (!regionId) {
      return NextResponse.json({ ok: false, error: 'regionId is required' }, { status: 400 });
    }

    // Find all posts missing coordinates
    const postsResult = await query(
      `SELECT id, name, address, intersection 
       FROM coverage_posts 
       WHERE region_id = $1 
         AND is_active = true 
         AND (lat IS NULL OR lng IS NULL)
         AND (address IS NOT NULL OR intersection IS NOT NULL)`,
      [regionId]
    );

    const posts = postsResult.rows as { id: number; name: string; address: string | null; intersection: string | null }[];

    if (posts.length === 0) {
      return NextResponse.json({
        ok: true,
        results: [],
        summary: { total: 0, success: 0, failed: 0 },
        message: 'No posts need geocoding',
      });
    }

    const results: GeocodeResult[] = [];

    for (const post of posts) {
      const locationText = post.address || post.intersection || '';
      if (!locationText.trim()) {
        results.push({
          postId: post.id,
          postName: post.name,
          success: false,
          error: 'No address or intersection',
        });
        continue;
      }

      try {
        // Call Geoapify Geocoding API
        const searchText = `${locationText}, Louisiana, USA`;
        const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(searchText)}&limit=1&apiKey=${GEOAPIFY_API_KEY}`;
        
        const geoRes = await fetch(url);
        if (!geoRes.ok) {
          results.push({
            postId: post.id,
            postName: post.name,
            success: false,
            error: `Geoapify API error: ${geoRes.status}`,
          });
          continue;
        }

        const geoData = await geoRes.json();
        
        if (!geoData.features || geoData.features.length === 0) {
          results.push({
            postId: post.id,
            postName: post.name,
            success: false,
            error: 'Address not found',
          });
          continue;
        }

        const [lng, lat] = geoData.features[0].geometry.coordinates;

        // Update the post with coordinates
        await query(
          `UPDATE coverage_posts SET lat = $1, lng = $2, updated_at = NOW() WHERE id = $3`,
          [lat, lng, post.id]
        );

        results.push({
          postId: post.id,
          postName: post.name,
          success: true,
          lat,
          lng,
        });

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (err: any) {
        results.push({
          postId: post.id,
          postName: post.name,
          success: false,
          error: err.message || 'Unknown error',
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      ok: true,
      results,
      summary: {
        total: results.length,
        success: successCount,
        failed: failedCount,
      },
    });

  } catch (err: any) {
    console.error('Error in /api/posts/geocode:', err);
    return NextResponse.json(
      { ok: false, error: 'Internal error during geocoding', details: err.message },
      { status: 500 }
    );
  }
}

