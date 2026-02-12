-- TurfRun Game Database Schema
-- PostgreSQL with PostGIS extension

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================
-- USERS TABLE (integrated with auth.users)
-- ============================================

-- Users table - extends Supabase auth.users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    color_hex TEXT NOT NULL DEFAULT '#3b82f6',
    total_ep INTEGER NOT NULL DEFAULT 0,
    respect_level INTEGER NOT NULL DEFAULT 1,
    last_seen_lat DOUBLE PRECISION,
    last_seen_lon DOUBLE PRECISION,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_username CHECK (LENGTH(username) >= 3 AND LENGTH(username) <= 30),
    CONSTRAINT valid_color_hex CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
    CONSTRAINT positive_ep CHECK (total_ep >= 0),
    CONSTRAINT positive_respect CHECK (respect_level >= 1 AND respect_level <= 100),
    CONSTRAINT valid_lat CHECK (last_seen_lat IS NULL OR (last_seen_lat >= -90 AND last_seen_lat <= 90)),
    CONSTRAINT valid_lon CHECK (last_seen_lon IS NULL OR (last_seen_lon >= -180 AND last_seen_lon <= 180))
);

-- ============================================
-- ZONE STATUS AND TABLES
-- ============================================

-- Zone status enum
CREATE TYPE zone_status AS ENUM ('neutral', 'safe', 'under_attack', 'war');

-- Zones table (only stores captured/contested zones, not empty zones)
CREATE TABLE IF NOT EXISTS zones (
    id TEXT PRIMARY KEY, -- grid_id format: "lat_lon" e.g., "12345_67890"
    geom GEOMETRY(POLYGON, 4326) NOT NULL,
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    defense_score INTEGER NOT NULL DEFAULT 50,
    status zone_status NOT NULL DEFAULT 'neutral',
    captured_at TIMESTAMPTZ,
    last_attack_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_defense_score CHECK (defense_score >= 0 AND defense_score <= 100)
);

-- ============================================
-- MISSIONS TABLE
-- ============================================

CREATE TYPE mission_type AS ENUM ('capture_zones', 'defend_zones', 'walk_distance', 'earn_ep', 'win_battles');
CREATE TYPE mission_status AS ENUM ('active', 'completed', 'expired');

CREATE TABLE IF NOT EXISTS missions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mission_type mission_type NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    target_value INTEGER NOT NULL,
    current_value INTEGER NOT NULL DEFAULT 0,
    reward_ep INTEGER NOT NULL DEFAULT 0,
    status mission_status NOT NULL DEFAULT 'active',
    expires_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_target CHECK (target_value > 0),
    CONSTRAINT valid_current CHECK (current_value >= 0 AND current_value <= target_value),
    CONSTRAINT valid_reward CHECK (reward_ep >= 0)
);

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================

CREATE TYPE notification_type AS ENUM ('zone_captured', 'zone_lost', 'zone_under_attack', 'mission_completed', 'level_up', 'battle_won', 'battle_lost');

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type notification_type NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_title CHECK (LENGTH(title) > 0 AND LENGTH(title) <= 200),
    CONSTRAINT valid_message CHECK (LENGTH(message) > 0 AND LENGTH(message) <= 1000)
);

-- ============================================
-- HISTORY/ACTIVITY LOG TABLE
-- ============================================

CREATE TYPE activity_type AS ENUM ('zone_captured', 'zone_lost', 'zone_attacked', 'zone_defended', 'ep_earned', 'respect_gained', 'mission_completed');

CREATE TABLE IF NOT EXISTS activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_type activity_type NOT NULL,
    zone_id TEXT REFERENCES zones(id) ON DELETE SET NULL,
    ep_change INTEGER DEFAULT 0,
    respect_change INTEGER DEFAULT 0,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_details CHECK (details IS NULL OR jsonb_typeof(details) = 'object')
);

-- ============================================
-- SPATIAL INDEXES
-- ============================================

-- Create GiST index on zones.geom for spatial queries
CREATE INDEX IF NOT EXISTS idx_zones_geom ON zones USING GIST(geom);

-- ============================================
-- PERFORMANCE INDEXES
-- ============================================

-- Zones indexes
CREATE INDEX IF NOT EXISTS idx_zones_owner ON zones(owner_id);
CREATE INDEX IF NOT EXISTS idx_zones_status ON zones(status);
CREATE INDEX IF NOT EXISTS idx_zones_captured_at ON zones(captured_at);

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_total_ep ON users(total_ep DESC);
CREATE INDEX IF NOT EXISTS idx_users_respect_level ON users(respect_level DESC);

-- Missions indexes
CREATE INDEX IF NOT EXISTS idx_missions_user_id ON missions(user_id);
CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status);
CREATE INDEX IF NOT EXISTS idx_missions_expires_at ON missions(expires_at) WHERE status = 'active';

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Activity log indexes
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_zone_id ON activity_log(zone_id) WHERE zone_id IS NOT NULL;

-- ============================================
-- HELPER FUNCTIONS - GRID CALCULATIONS
-- ============================================

-- Helper function: Generate grid_id from latitude and longitude
-- Grid size: 50m (~0.00045 degrees at equator, varies by latitude)
-- Improved accuracy using haversine-based calculation
CREATE OR REPLACE FUNCTION generate_grid_id(lat DOUBLE PRECISION, lon DOUBLE PRECISION)
RETURNS TEXT AS $$
DECLARE
    -- Use more accurate grid size calculation based on latitude
    -- At equator: 1 degree ≈ 111km, so 50m ≈ 0.00045 degrees
    -- Adjust for latitude: degrees_lon = degrees_lat / cos(lat)
    grid_size_lat DOUBLE PRECISION := 0.00045;
    grid_size_lon DOUBLE PRECISION;
BEGIN
    -- Validate inputs
    IF lat IS NULL OR lon IS NULL THEN
        RAISE EXCEPTION 'Latitude and longitude cannot be NULL';
    END IF;
    
    IF lat < -90 OR lat > 90 THEN
        RAISE EXCEPTION 'Invalid latitude: must be between -90 and 90';
    END IF;
    
    IF lon < -180 OR lon > 180 THEN
        RAISE EXCEPTION 'Invalid longitude: must be between -180 and 180';
    END IF;
    
    -- Adjust longitude grid size based on latitude
    grid_size_lon := grid_size_lat / GREATEST(COS(RADIANS(lat)), 0.01);
    
    RETURN FLOOR(lat / grid_size_lat)::TEXT || '_' || FLOOR(lon / grid_size_lon)::TEXT;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- Helper function: Generate polygon geometry for a grid cell from lat/lon
-- Snaps to grid and creates a 50m x 50m polygon (approximate)
CREATE OR REPLACE FUNCTION generate_zone_geom(lat DOUBLE PRECISION, lon DOUBLE PRECISION)
RETURNS GEOMETRY AS $$
DECLARE
    grid_lat DOUBLE PRECISION;
    grid_lon DOUBLE PRECISION;
    grid_size_lat DOUBLE PRECISION := 0.00045;
    grid_size_lon DOUBLE PRECISION;
BEGIN
    -- Validate inputs
    IF lat IS NULL OR lon IS NULL THEN
        RAISE EXCEPTION 'Latitude and longitude cannot be NULL';
    END IF;
    
    IF lat < -90 OR lat > 90 THEN
        RAISE EXCEPTION 'Invalid latitude: must be between -90 and 90';
    END IF;
    
    IF lon < -180 OR lon > 180 THEN
        RAISE EXCEPTION 'Invalid longitude: must be between -180 and 180';
    END IF;
    
    -- Adjust longitude grid size based on latitude
    grid_size_lon := grid_size_lat / GREATEST(COS(RADIANS(lat)), 0.01);
    
    -- Snap to grid
    grid_lat := FLOOR(lat / grid_size_lat) * grid_size_lat;
    grid_lon := FLOOR(lon / grid_size_lon) * grid_size_lon;
    
    -- Create polygon using ST_MakeEnvelope
    RETURN ST_MakeEnvelope(
        grid_lon,
        grid_lat,
        grid_lon + grid_size_lon,
        grid_lat + grid_size_lat,
        4326
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- Helper function: Get or create zone by coordinates
-- Returns the grid_id for the given coordinates
CREATE OR REPLACE FUNCTION get_zone_id_at_location(lat DOUBLE PRECISION, lon DOUBLE PRECISION)
RETURNS TEXT AS $$
BEGIN
    RETURN generate_grid_id(lat, lon);
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- ============================================
-- EP AND RESPECT CALCULATION FUNCTIONS
-- ============================================

-- Calculate respect level from total EP
CREATE OR REPLACE FUNCTION calculate_respect_level(total_ep INTEGER)
RETURNS INTEGER AS $$
BEGIN
    -- Simple formula: level = 1 + floor(sqrt(total_ep / 100))
    -- Level 1: 0 EP
    -- Level 2: 100 EP
    -- Level 5: 1600 EP
    -- Level 10: 8100 EP
    -- Level 20: 36100 EP
    RETURN GREATEST(1, LEAST(100, 1 + FLOOR(SQRT(GREATEST(0, total_ep) / 100.0))::INTEGER));
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- Award EP to a user and update respect level
CREATE OR REPLACE FUNCTION award_ep(p_user_id UUID, ep_amount INTEGER, reason TEXT DEFAULT NULL)
RETURNS TABLE (
    new_total_ep INTEGER,
    new_respect_level INTEGER,
    old_respect_level INTEGER,
    leveled_up BOOLEAN
) AS $$
DECLARE
    v_old_ep INTEGER;
    v_new_ep INTEGER;
    v_old_level INTEGER;
    v_new_level INTEGER;
BEGIN
    -- Validate inputs
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID cannot be NULL';
    END IF;
    
    IF ep_amount IS NULL OR ep_amount <= 0 THEN
        RAISE EXCEPTION 'EP amount must be positive';
    END IF;
    
    -- Lock the user row for update
    SELECT total_ep, respect_level INTO v_old_ep, v_old_level
    FROM users
    WHERE id = p_user_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    
    -- Calculate new EP and respect level
    v_new_ep := v_old_ep + ep_amount;
    v_new_level := calculate_respect_level(v_new_ep);
    
    -- Update user
    UPDATE users
    SET total_ep = v_new_ep,
        respect_level = v_new_level
    WHERE id = p_user_id;
    
    -- Log activity
    INSERT INTO activity_log (user_id, activity_type, ep_change, respect_change, details)
    VALUES (
        p_user_id,
        'ep_earned',
        ep_amount,
        v_new_level - v_old_level,
        jsonb_build_object('reason', reason, 'old_ep', v_old_ep, 'new_ep', v_new_ep)
    );
    
    -- Create notification if leveled up
    IF v_new_level > v_old_level THEN
        INSERT INTO notifications (user_id, notification_type, title, message, data)
        VALUES (
            p_user_id,
            'level_up',
            'Level Up!',
            format('Congratulations! You reached Respect Level %s', v_new_level),
            jsonb_build_object('old_level', v_old_level, 'new_level', v_new_level)
        );
        
        INSERT INTO activity_log (user_id, activity_type, respect_change, details)
        VALUES (
            p_user_id,
            'respect_gained',
            v_new_level - v_old_level,
            jsonb_build_object('old_level', v_old_level, 'new_level', v_new_level)
        );
    END IF;
    
    RETURN QUERY SELECT v_new_ep, v_new_level, v_old_level, (v_new_level > v_old_level);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- TRIGGER FUNCTIONS
-- ============================================

-- Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_zones_updated_at ON zones;
CREATE TRIGGER update_zones_updated_at
    BEFORE UPDATE ON zones
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_missions_updated_at ON missions;
CREATE TRIGGER update_missions_updated_at
    BEFORE UPDATE ON missions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
