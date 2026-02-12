-- Remote Procedure Calls (RPC) for TurfRun Game

-- ============================================
-- VIEWPORT QUERY - Get zones in visible bounds
-- ============================================

-- PUBLIC_INTERFACE
-- RPC: Get all zones within viewport bounds
-- Uses ST_MakeEnvelope and && operator for efficient spatial query
CREATE OR REPLACE FUNCTION get_zones_in_bounds(
    min_lon DOUBLE PRECISION,
    min_lat DOUBLE PRECISION,
    max_lon DOUBLE PRECISION,
    max_lat DOUBLE PRECISION
)
RETURNS TABLE (
    id TEXT,
    geom GEOMETRY,
    owner_id UUID,
    owner_username TEXT,
    owner_color TEXT,
    defense_score INTEGER,
    status zone_status,
    captured_at TIMESTAMPTZ,
    last_attack_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        z.id,
        z.geom,
        z.owner_id,
        u.username AS owner_username,
        u.color_hex AS owner_color,
        z.defense_score,
        z.status,
        z.captured_at,
        z.last_attack_at
    FROM zones z
    LEFT JOIN users u ON z.owner_id = u.id
    WHERE z.geom && ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================
-- DISTANCE CALCULATIONS
-- ============================================

-- PUBLIC_INTERFACE
-- RPC: Calculate distance between two points in meters using ST_DistanceSphere
CREATE OR REPLACE FUNCTION calculate_distance_meters(
    lat1 DOUBLE PRECISION,
    lon1 DOUBLE PRECISION,
    lat2 DOUBLE PRECISION,
    lon2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION AS $$
BEGIN
    RETURN ST_DistanceSphere(
        ST_MakePoint(lon1, lat1)::geography,
        ST_MakePoint(lon2, lat2)::geography
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- PUBLIC_INTERFACE
-- RPC: Get zones within a certain radius from a point (in meters)
CREATE OR REPLACE FUNCTION get_zones_within_radius(
    center_lat DOUBLE PRECISION,
    center_lon DOUBLE PRECISION,
    radius_meters DOUBLE PRECISION
)
RETURNS TABLE (
    id TEXT,
    geom GEOMETRY,
    owner_id UUID,
    owner_username TEXT,
    owner_color TEXT,
    defense_score INTEGER,
    status zone_status,
    distance_meters DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        z.id,
        z.geom,
        z.owner_id,
        u.username AS owner_username,
        u.color_hex AS owner_color,
        z.defense_score,
        z.status,
        ST_DistanceSphere(
            ST_Centroid(z.geom)::geography,
            ST_MakePoint(center_lon, center_lat)::geography
        ) AS distance_meters
    FROM zones z
    LEFT JOIN users u ON z.owner_id = u.id
    WHERE ST_DistanceSphere(
        ST_Centroid(z.geom)::geography,
        ST_MakePoint(center_lon, center_lat)::geography
    ) <= radius_meters
    ORDER BY distance_meters ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================
-- ZONE CAPTURE MECHANICS
-- ============================================

-- PUBLIC_INTERFACE
-- RPC: Capture a zone (create if doesn't exist, update if exists)
CREATE OR REPLACE FUNCTION capture_zone(
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    user_id UUID
)
RETURNS TABLE (
    success BOOLEAN,
    zone_id TEXT,
    message TEXT
) AS $$
DECLARE
    v_zone_id TEXT;
    v_zone_geom GEOMETRY;
    v_current_owner UUID;
    v_current_status zone_status;
BEGIN
    -- Generate zone ID and geometry
    v_zone_id := generate_grid_id(lat, lon);
    v_zone_geom := generate_zone_geom(lat, lon);
    
    -- Check if zone already exists
    SELECT owner_id, status INTO v_current_owner, v_current_status
    FROM zones WHERE id = v_zone_id;
    
    IF v_current_owner IS NULL THEN
        -- Zone doesn't exist or is neutral, create/capture it
        INSERT INTO zones (id, geom, owner_id, defense_score, status, captured_at)
        VALUES (v_zone_id, v_zone_geom, user_id, 50, 'safe', NOW())
        ON CONFLICT (id) DO UPDATE
        SET owner_id = user_id,
            defense_score = 50,
            status = 'safe',
            captured_at = NOW();
            
        RETURN QUERY SELECT true, v_zone_id, 'Zone captured successfully'::TEXT;
    ELSIF v_current_owner = user_id THEN
        -- User already owns this zone
        RETURN QUERY SELECT false, v_zone_id, 'You already own this zone'::TEXT;
    ELSE
        -- Zone owned by another player, initiate attack
        UPDATE zones
        SET status = 'under_attack',
            last_attack_at = NOW()
        WHERE id = v_zone_id;
        
        RETURN QUERY SELECT true, v_zone_id, 'Attack initiated on enemy zone'::TEXT;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PUBLIC_INTERFACE
-- RPC: Get player statistics
CREATE OR REPLACE FUNCTION get_player_stats(user_id UUID)
RETURNS TABLE (
    username TEXT,
    color_hex TEXT,
    total_ep INTEGER,
    respect_level INTEGER,
    zones_owned INTEGER,
    zones_under_attack INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.username,
        u.color_hex,
        u.total_ep,
        u.respect_level,
        COUNT(z.id) FILTER (WHERE z.status IN ('safe', 'war'))::INTEGER AS zones_owned,
        COUNT(z.id) FILTER (WHERE z.status = 'under_attack')::INTEGER AS zones_under_attack
    FROM users u
    LEFT JOIN zones z ON z.owner_id = u.id
    WHERE u.id = user_id
    GROUP BY u.id, u.username, u.color_hex, u.total_ep, u.respect_level;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- PUBLIC_INTERFACE
-- RPC: Get leaderboard (top players by EP)
CREATE OR REPLACE FUNCTION get_leaderboard(limit_count INTEGER DEFAULT 100)
RETURNS TABLE (
    rank BIGINT,
    user_id UUID,
    username TEXT,
    color_hex TEXT,
    total_ep INTEGER,
    respect_level INTEGER,
    zones_owned BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ROW_NUMBER() OVER (ORDER BY u.total_ep DESC) AS rank,
        u.id AS user_id,
        u.username,
        u.color_hex,
        u.total_ep,
        u.respect_level,
        COUNT(z.id) AS zones_owned
    FROM users u
    LEFT JOIN zones z ON z.owner_id = u.id AND z.status IN ('safe', 'war')
    GROUP BY u.id, u.username, u.color_hex, u.total_ep, u.respect_level
    ORDER BY u.total_ep DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- PUBLIC_INTERFACE
-- RPC: Update zone defense score (during defend actions)
CREATE OR REPLACE FUNCTION update_zone_defense(
    zone_id TEXT,
    defense_change INTEGER
)
RETURNS TABLE (
    success BOOLEAN,
    new_defense_score INTEGER,
    message TEXT
) AS $$
DECLARE
    v_new_score INTEGER;
BEGIN
    UPDATE zones
    SET defense_score = GREATEST(0, LEAST(100, defense_score + defense_change))
    WHERE id = zone_id
    RETURNING defense_score INTO v_new_score;
    
    IF v_new_score IS NULL THEN
        RETURN QUERY SELECT false, 0, 'Zone not found'::TEXT;
    ELSE
        RETURN QUERY SELECT true, v_new_score, 'Defense score updated'::TEXT;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PUBLIC_INTERFACE
-- RPC: Check if user is within attack range of a zone (50 meters)
CREATE OR REPLACE FUNCTION is_in_attack_range(
    zone_id TEXT,
    user_lat DOUBLE PRECISION,
    user_lon DOUBLE PRECISION
)
RETURNS BOOLEAN AS $$
DECLARE
    zone_center GEOMETRY;
    distance_m DOUBLE PRECISION;
BEGIN
    SELECT ST_Centroid(geom) INTO zone_center
    FROM zones WHERE id = zone_id;
    
    IF zone_center IS NULL THEN
        RETURN false;
    END IF;
    
    distance_m := ST_DistanceSphere(
        zone_center::geography,
        ST_MakePoint(user_lon, user_lat)::geography
    );
    
    -- 50 meter attack range
    RETURN distance_m <= 50;
END;
$$ LANGUAGE plpgsql STABLE;
