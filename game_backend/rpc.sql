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
    -- Validate inputs
    IF min_lat IS NULL OR min_lon IS NULL OR max_lat IS NULL OR max_lon IS NULL THEN
        RAISE EXCEPTION 'All bounds parameters are required';
    END IF;
    
    IF min_lat < -90 OR min_lat > 90 OR max_lat < -90 OR max_lat > 90 THEN
        RAISE EXCEPTION 'Invalid latitude: must be between -90 and 90';
    END IF;
    
    IF min_lon < -180 OR min_lon > 180 OR max_lon < -180 OR max_lon > 180 THEN
        RAISE EXCEPTION 'Invalid longitude: must be between -180 and 180';
    END IF;
    
    IF min_lat >= max_lat THEN
        RAISE EXCEPTION 'min_lat must be less than max_lat';
    END IF;
    
    IF min_lon >= max_lon THEN
        RAISE EXCEPTION 'min_lon must be less than max_lon';
    END IF;
    
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
    -- Validate inputs
    IF lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN
        RAISE EXCEPTION 'All coordinate parameters are required';
    END IF;
    
    IF lat1 < -90 OR lat1 > 90 OR lat2 < -90 OR lat2 > 90 THEN
        RAISE EXCEPTION 'Invalid latitude: must be between -90 and 90';
    END IF;
    
    IF lon1 < -180 OR lon1 > 180 OR lon2 < -180 OR lon2 > 180 THEN
        RAISE EXCEPTION 'Invalid longitude: must be between -180 and 180';
    END IF;
    
    RETURN ST_DistanceSphere(
        ST_MakePoint(lon1, lat1)::geography,
        ST_MakePoint(lon2, lat2)::geography
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

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
    -- Validate inputs
    IF center_lat IS NULL OR center_lon IS NULL OR radius_meters IS NULL THEN
        RAISE EXCEPTION 'All parameters are required';
    END IF;
    
    IF center_lat < -90 OR center_lat > 90 THEN
        RAISE EXCEPTION 'Invalid latitude: must be between -90 and 90';
    END IF;
    
    IF center_lon < -180 OR center_lon > 180 THEN
        RAISE EXCEPTION 'Invalid longitude: must be between -180 and 180';
    END IF;
    
    IF radius_meters <= 0 OR radius_meters > 10000 THEN
        RAISE EXCEPTION 'Invalid radius: must be between 0 and 10000 meters';
    END IF;
    
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
-- ZONE CAPTURE MECHANICS (with locking and EP rewards)
-- ============================================

-- PUBLIC_INTERFACE
-- RPC: Capture a zone (create if doesn't exist, update if exists)
-- Includes proper locking to prevent race conditions
CREATE OR REPLACE FUNCTION capture_zone(
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    user_id UUID
)
RETURNS TABLE (
    success BOOLEAN,
    zone_id TEXT,
    message TEXT,
    ep_awarded INTEGER
) AS $$
DECLARE
    v_zone_id TEXT;
    v_zone_geom GEOMETRY;
    v_current_owner UUID;
    v_current_status zone_status;
    v_ep_reward INTEGER := 0;
BEGIN
    -- Validate inputs
    IF lat IS NULL OR lon IS NULL OR user_id IS NULL THEN
        RAISE EXCEPTION 'All parameters are required';
    END IF;
    
    IF lat < -90 OR lat > 90 THEN
        RAISE EXCEPTION 'Invalid latitude: must be between -90 and 90';
    END IF;
    
    IF lon < -180 OR lon > 180 THEN
        RAISE EXCEPTION 'Invalid longitude: must be between -180 and 180';
    END IF;
    
    -- Verify user exists
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = user_id) THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    
    -- Generate zone ID and geometry
    v_zone_id := generate_grid_id(lat, lon);
    v_zone_geom := generate_zone_geom(lat, lon);
    
    -- Lock the zone row if it exists (prevents race conditions)
    SELECT owner_id, status INTO v_current_owner, v_current_status
    FROM zones 
    WHERE id = v_zone_id
    FOR UPDATE NOWAIT;
    
    IF v_current_owner IS NULL THEN
        -- Zone doesn't exist or is neutral, create/capture it
        INSERT INTO zones (id, geom, owner_id, defense_score, status, captured_at)
        VALUES (v_zone_id, v_zone_geom, user_id, 50, 'safe', NOW())
        ON CONFLICT (id) DO UPDATE
        SET owner_id = user_id,
            defense_score = 50,
            status = 'safe',
            captured_at = NOW();
        
        -- Award EP for capturing neutral zone
        v_ep_reward := 10;
        PERFORM award_ep(user_id, v_ep_reward, 'Captured neutral zone');
        
        -- Create notification
        INSERT INTO notifications (user_id, notification_type, title, message, data)
        VALUES (
            user_id,
            'zone_captured',
            'Zone Captured!',
            format('You captured zone %s and earned %s EP', v_zone_id, v_ep_reward),
            jsonb_build_object('zone_id', v_zone_id, 'ep_awarded', v_ep_reward)
        );
        
        -- Log activity
        INSERT INTO activity_log (user_id, activity_type, zone_id, ep_change, details)
        VALUES (
            user_id,
            'zone_captured',
            v_zone_id,
            v_ep_reward,
            jsonb_build_object('action', 'neutral_capture')
        );
        
        -- Update mission progress
        PERFORM update_mission_progress(user_id, 'capture_zones', 1);
        
        RETURN QUERY SELECT true, v_zone_id, 'Zone captured successfully'::TEXT, v_ep_reward;
        
    ELSIF v_current_owner = user_id THEN
        -- User already owns this zone, boost defense
        UPDATE zones
        SET defense_score = LEAST(100, defense_score + 5)
        WHERE id = v_zone_id;
        
        RETURN QUERY SELECT false, v_zone_id, 'You already own this zone (defense boosted +5)'::TEXT, 0;
        
    ELSE
        -- Zone owned by another player, initiate attack
        UPDATE zones
        SET status = 'under_attack',
            last_attack_at = NOW()
        WHERE id = v_zone_id;
        
        -- Notify the owner
        INSERT INTO notifications (user_id, notification_type, title, message, data)
        VALUES (
            v_current_owner,
            'zone_under_attack',
            'Zone Under Attack!',
            format('Your zone %s is being attacked!', v_zone_id),
            jsonb_build_object('zone_id', v_zone_id, 'attacker_id', user_id)
        );
        
        -- Log activity
        INSERT INTO activity_log (user_id, activity_type, zone_id, details)
        VALUES (
            user_id,
            'zone_attacked',
            v_zone_id,
            jsonb_build_object('defender_id', v_current_owner, 'action', 'attack_initiated')
        );
        
        RETURN QUERY SELECT true, v_zone_id, 'Attack initiated on enemy zone'::TEXT, 0;
    END IF;
    
EXCEPTION
    WHEN lock_not_available THEN
        RETURN QUERY SELECT false, v_zone_id, 'Zone is currently locked (another operation in progress)'::TEXT, 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PUBLIC_INTERFACE
-- RPC: Attack a zone (reduce defense score)
CREATE OR REPLACE FUNCTION attack_zone(
    zone_id TEXT,
    attacker_id UUID,
    attack_power INTEGER DEFAULT 10
)
RETURNS TABLE (
    success BOOLEAN,
    zone_captured BOOLEAN,
    new_defense_score INTEGER,
    message TEXT,
    ep_awarded INTEGER
) AS $$
DECLARE
    v_owner_id UUID;
    v_current_defense INTEGER;
    v_new_defense INTEGER;
    v_ep_reward INTEGER := 0;
BEGIN
    -- Validate inputs
    IF zone_id IS NULL OR attacker_id IS NULL THEN
        RAISE EXCEPTION 'Zone ID and attacker ID are required';
    END IF;
    
    IF attack_power IS NULL OR attack_power <= 0 OR attack_power > 50 THEN
        RAISE EXCEPTION 'Invalid attack power: must be between 1 and 50';
    END IF;
    
    -- Lock zone for update
    SELECT owner_id, defense_score INTO v_owner_id, v_current_defense
    FROM zones
    WHERE id = zone_id
    FOR UPDATE NOWAIT;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, false, 0, 'Zone not found'::TEXT, 0;
        RETURN;
    END IF;
    
    IF v_owner_id = attacker_id THEN
        RETURN QUERY SELECT false, false, v_current_defense, 'Cannot attack your own zone'::TEXT, 0;
        RETURN;
    END IF;
    
    -- Calculate new defense score
    v_new_defense := GREATEST(0, v_current_defense - attack_power);
    
    -- Check if zone is captured
    IF v_new_defense = 0 THEN
        -- Zone captured!
        UPDATE zones
        SET owner_id = attacker_id,
            defense_score = 50,
            status = 'safe',
            captured_at = NOW()
        WHERE id = zone_id;
        
        -- Award EP for successful capture
        v_ep_reward := 25;
        PERFORM award_ep(attacker_id, v_ep_reward, format('Captured zone %s from enemy', zone_id));
        
        -- Notify old owner
        INSERT INTO notifications (user_id, notification_type, title, message, data)
        VALUES (
            v_owner_id,
            'zone_lost',
            'Zone Lost!',
            format('You lost zone %s to an attacker', zone_id),
            jsonb_build_object('zone_id', zone_id, 'attacker_id', attacker_id)
        );
        
        -- Notify attacker
        INSERT INTO notifications (user_id, notification_type, title, message, data)
        VALUES (
            attacker_id,
            'zone_captured',
            'Zone Captured!',
            format('You captured zone %s and earned %s EP', zone_id, v_ep_reward),
            jsonb_build_object('zone_id', zone_id, 'ep_awarded', v_ep_reward)
        );
        
        -- Log activities
        INSERT INTO activity_log (user_id, activity_type, zone_id, ep_change, details)
        VALUES (
            attacker_id,
            'zone_captured',
            zone_id,
            v_ep_reward,
            jsonb_build_object('action', 'battle_capture', 'previous_owner', v_owner_id)
        );
        
        INSERT INTO activity_log (user_id, activity_type, zone_id, details)
        VALUES (
            v_owner_id,
            'zone_lost',
            zone_id,
            jsonb_build_object('action', 'battle_lost', 'attacker', attacker_id)
        );
        
        -- Update missions
        PERFORM update_mission_progress(attacker_id, 'capture_zones', 1);
        PERFORM update_mission_progress(attacker_id, 'win_battles', 1);
        
        RETURN QUERY SELECT true, true, 50, format('Zone captured! Earned %s EP', v_ep_reward)::TEXT, v_ep_reward;
    ELSE
        -- Zone defense reduced but not captured
        UPDATE zones
        SET defense_score = v_new_defense,
            status = 'under_attack',
            last_attack_at = NOW()
        WHERE id = zone_id;
        
        -- Small EP reward for successful attack
        v_ep_reward := 2;
        PERFORM award_ep(attacker_id, v_ep_reward, 'Attacked enemy zone');
        
        -- Log activity
        INSERT INTO activity_log (user_id, activity_type, zone_id, ep_change, details)
        VALUES (
            attacker_id,
            'zone_attacked',
            zone_id,
            v_ep_reward,
            jsonb_build_object('action', 'attack_damage', 'damage', attack_power, 'new_defense', v_new_defense)
        );
        
        RETURN QUERY SELECT true, false, v_new_defense, format('Attack successful! Defense reduced to %s. Earned %s EP', v_new_defense, v_ep_reward)::TEXT, v_ep_reward;
    END IF;
    
EXCEPTION
    WHEN lock_not_available THEN
        RETURN QUERY SELECT false, false, 0, 'Zone is currently locked (another operation in progress)'::TEXT, 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PUBLIC_INTERFACE
-- RPC: Defend a zone (increase defense score)
CREATE OR REPLACE FUNCTION defend_zone(
    zone_id TEXT,
    defender_id UUID,
    defense_boost INTEGER DEFAULT 10
)
RETURNS TABLE (
    success BOOLEAN,
    new_defense_score INTEGER,
    message TEXT,
    ep_awarded INTEGER
) AS $$
DECLARE
    v_owner_id UUID;
    v_current_defense INTEGER;
    v_new_defense INTEGER;
    v_ep_reward INTEGER := 0;
BEGIN
    -- Validate inputs
    IF zone_id IS NULL OR defender_id IS NULL THEN
        RAISE EXCEPTION 'Zone ID and defender ID are required';
    END IF;
    
    IF defense_boost IS NULL OR defense_boost <= 0 OR defense_boost > 30 THEN
        RAISE EXCEPTION 'Invalid defense boost: must be between 1 and 30';
    END IF;
    
    -- Lock zone for update
    SELECT owner_id, defense_score INTO v_owner_id, v_current_defense
    FROM zones
    WHERE id = zone_id
    FOR UPDATE NOWAIT;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 0, 'Zone not found'::TEXT, 0;
        RETURN;
    END IF;
    
    IF v_owner_id != defender_id THEN
        RETURN QUERY SELECT false, v_current_defense, 'You do not own this zone'::TEXT, 0;
        RETURN;
    END IF;
    
    -- Calculate new defense score
    v_new_defense := LEAST(100, v_current_defense + defense_boost);
    
    UPDATE zones
    SET defense_score = v_new_defense,
        status = CASE WHEN v_new_defense >= 70 THEN 'safe' ELSE status END
    WHERE id = zone_id;
    
    -- Award EP for defending
    v_ep_reward := 5;
    PERFORM award_ep(defender_id, v_ep_reward, format('Defended zone %s', zone_id));
    
    -- Log activity
    INSERT INTO activity_log (user_id, activity_type, zone_id, ep_change, details)
    VALUES (
        defender_id,
        'zone_defended',
        zone_id,
        v_ep_reward,
        jsonb_build_object('action', 'defense_boost', 'boost', defense_boost, 'new_defense', v_new_defense)
    );
    
    -- Update missions
    PERFORM update_mission_progress(defender_id, 'defend_zones', 1);
    
    RETURN QUERY SELECT true, v_new_defense, format('Defense increased to %s! Earned %s EP', v_new_defense, v_ep_reward)::TEXT, v_ep_reward;
    
EXCEPTION
    WHEN lock_not_available THEN
        RETURN QUERY SELECT false, 0, 'Zone is currently locked (another operation in progress)'::TEXT, 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PLAYER STATISTICS
-- ============================================

-- PUBLIC_INTERFACE
-- RPC: Get player statistics
CREATE OR REPLACE FUNCTION get_player_stats(user_id UUID)
RETURNS TABLE (
    username TEXT,
    color_hex TEXT,
    total_ep INTEGER,
    respect_level INTEGER,
    zones_owned INTEGER,
    zones_under_attack INTEGER,
    active_missions INTEGER,
    unread_notifications INTEGER
) AS $$
BEGIN
    IF user_id IS NULL THEN
        RAISE EXCEPTION 'User ID is required';
    END IF;
    
    RETURN QUERY
    SELECT 
        u.username,
        u.color_hex,
        u.total_ep,
        u.respect_level,
        COUNT(DISTINCT z.id) FILTER (WHERE z.status IN ('safe', 'war'))::INTEGER AS zones_owned,
        COUNT(DISTINCT z.id) FILTER (WHERE z.status = 'under_attack')::INTEGER AS zones_under_attack,
        COUNT(DISTINCT m.id) FILTER (WHERE m.status = 'active')::INTEGER AS active_missions,
        COUNT(DISTINCT n.id) FILTER (WHERE n.read = false)::INTEGER AS unread_notifications
    FROM users u
    LEFT JOIN zones z ON z.owner_id = u.id
    LEFT JOIN missions m ON m.user_id = u.id
    LEFT JOIN notifications n ON n.user_id = u.id
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
    IF limit_count IS NULL OR limit_count <= 0 OR limit_count > 1000 THEN
        RAISE EXCEPTION 'Invalid limit: must be between 1 and 1000';
    END IF;
    
    RETURN QUERY
    SELECT 
        ROW_NUMBER() OVER (ORDER BY u.total_ep DESC, u.created_at ASC) AS rank,
        u.id AS user_id,
        u.username,
        u.color_hex,
        u.total_ep,
        u.respect_level,
        COUNT(z.id) AS zones_owned
    FROM users u
    LEFT JOIN zones z ON z.owner_id = u.id AND z.status IN ('safe', 'war', 'under_attack')
    GROUP BY u.id, u.username, u.color_hex, u.total_ep, u.respect_level, u.created_at
    ORDER BY u.total_ep DESC, u.created_at ASC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================
-- MISSIONS AND PROGRESSION
-- ============================================

-- PUBLIC_INTERFACE
-- RPC: Update mission progress
CREATE OR REPLACE FUNCTION update_mission_progress(
    p_user_id UUID,
    p_mission_type mission_type,
    progress_increment INTEGER DEFAULT 1
)
RETURNS VOID AS $$
DECLARE
    mission_record RECORD;
BEGIN
    -- Update active missions of this type
    FOR mission_record IN
        SELECT id, target_value, current_value, reward_ep
        FROM missions
        WHERE user_id = p_user_id
          AND mission_type = p_mission_type
          AND status = 'active'
        FOR UPDATE
    LOOP
        -- Increment progress
        UPDATE missions
        SET current_value = LEAST(target_value, current_value + progress_increment)
        WHERE id = mission_record.id;
        
        -- Check if completed
        IF (mission_record.current_value + progress_increment) >= mission_record.target_value THEN
            UPDATE missions
            SET status = 'completed',
                completed_at = NOW()
            WHERE id = mission_record.id;
            
            -- Award EP
            PERFORM award_ep(p_user_id, mission_record.reward_ep, format('Completed mission: %s', p_mission_type));
            
            -- Create notification
            INSERT INTO notifications (user_id, notification_type, title, message, data)
            VALUES (
                p_user_id,
                'mission_completed',
                'Mission Completed!',
                format('You completed a mission and earned %s EP', mission_record.reward_ep),
                jsonb_build_object('mission_id', mission_record.id, 'ep_awarded', mission_record.reward_ep)
            );
            
            -- Log activity
            INSERT INTO activity_log (user_id, activity_type, ep_change, details)
            VALUES (
                p_user_id,
                'mission_completed',
                mission_record.reward_ep,
                jsonb_build_object('mission_id', mission_record.id, 'mission_type', p_mission_type)
            );
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PUBLIC_INTERFACE
-- RPC: Get user missions
CREATE OR REPLACE FUNCTION get_user_missions(
    p_user_id UUID,
    p_status mission_status DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    mission_type mission_type,
    title TEXT,
    description TEXT,
    target_value INTEGER,
    current_value INTEGER,
    progress_percent INTEGER,
    reward_ep INTEGER,
    status mission_status,
    expires_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
) AS $$
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID is required';
    END IF;
    
    RETURN QUERY
    SELECT 
        m.id,
        m.mission_type,
        m.title,
        m.description,
        m.target_value,
        m.current_value,
        (m.current_value * 100 / NULLIF(m.target_value, 0))::INTEGER AS progress_percent,
        m.reward_ep,
        m.status,
        m.expires_at,
        m.completed_at
    FROM missions m
    WHERE m.user_id = p_user_id
      AND (p_status IS NULL OR m.status = p_status)
    ORDER BY 
        CASE m.status 
            WHEN 'active' THEN 1
            WHEN 'completed' THEN 2
            WHEN 'expired' THEN 3
        END,
        m.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- PUBLIC_INTERFACE
-- RPC: Create initial missions for new user
CREATE OR REPLACE FUNCTION create_initial_missions(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID is required';
    END IF;
    
    -- Capture zones mission
    INSERT INTO missions (user_id, mission_type, title, description, target_value, reward_ep, expires_at)
    VALUES (
        p_user_id,
        'capture_zones',
        'Capture 5 Zones',
        'Capture 5 neutral or enemy zones to earn EP',
        5,
        50,
        NOW() + INTERVAL '7 days'
    );
    
    -- Earn EP mission
    INSERT INTO missions (user_id, mission_type, title, description, target_value, reward_ep, expires_at)
    VALUES (
        p_user_id,
        'earn_ep',
        'Earn 100 EP',
        'Accumulate 100 Experience Points through gameplay',
        100,
        25,
        NOW() + INTERVAL '7 days'
    );
    
    -- Defend zones mission
    INSERT INTO missions (user_id, mission_type, title, description, target_value, reward_ep, expires_at)
    VALUES (
        p_user_id,
        'defend_zones',
        'Defend 3 Times',
        'Successfully defend your zones 3 times',
        3,
        30,
        NOW() + INTERVAL '7 days'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- NOTIFICATIONS
-- ============================================

-- PUBLIC_INTERFACE
-- RPC: Get user notifications
CREATE OR REPLACE FUNCTION get_user_notifications(
    p_user_id UUID,
    include_read BOOLEAN DEFAULT false,
    limit_count INTEGER DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    notification_type notification_type,
    title TEXT,
    message TEXT,
    data JSONB,
    read BOOLEAN,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID is required';
    END IF;
    
    IF limit_count IS NULL OR limit_count <= 0 OR limit_count > 200 THEN
        RAISE EXCEPTION 'Invalid limit: must be between 1 and 200';
    END IF;
    
    RETURN QUERY
    SELECT 
        n.id,
        n.notification_type,
        n.title,
        n.message,
        n.data,
        n.read,
        n.created_at
    FROM notifications n
    WHERE n.user_id = p_user_id
      AND (include_read OR n.read = false)
    ORDER BY n.created_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- PUBLIC_INTERFACE
-- RPC: Mark notification as read
CREATE OR REPLACE FUNCTION mark_notification_read(
    p_notification_id UUID,
    p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    rows_updated INTEGER;
BEGIN
    IF p_notification_id IS NULL OR p_user_id IS NULL THEN
        RAISE EXCEPTION 'Notification ID and User ID are required';
    END IF;
    
    UPDATE notifications
    SET read = true
    WHERE id = p_notification_id
      AND user_id = p_user_id
      AND read = false;
    
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    RETURN rows_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PUBLIC_INTERFACE
-- RPC: Mark all notifications as read
CREATE OR REPLACE FUNCTION mark_all_notifications_read(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    rows_updated INTEGER;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID is required';
    END IF;
    
    UPDATE notifications
    SET read = true
    WHERE user_id = p_user_id
      AND read = false;
    
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    RETURN rows_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- ACTIVITY LOG
-- ============================================

-- PUBLIC_INTERFACE
-- RPC: Get user activity log
CREATE OR REPLACE FUNCTION get_user_activity_log(
    p_user_id UUID,
    limit_count INTEGER DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    activity_type activity_type,
    zone_id TEXT,
    ep_change INTEGER,
    respect_change INTEGER,
    details JSONB,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID is required';
    END IF;
    
    IF limit_count IS NULL OR limit_count <= 0 OR limit_count > 200 THEN
        RAISE EXCEPTION 'Invalid limit: must be between 1 and 200';
    END IF;
    
    RETURN QUERY
    SELECT 
        a.id,
        a.activity_type,
        a.zone_id,
        a.ep_change,
        a.respect_change,
        a.details,
        a.created_at
    FROM activity_log a
    WHERE a.user_id = p_user_id
    ORDER BY a.created_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================
-- UTILITY FUNCTIONS
-- ============================================

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
    IF zone_id IS NULL OR user_lat IS NULL OR user_lon IS NULL THEN
        RETURN false;
    END IF;
    
    IF user_lat < -90 OR user_lat > 90 OR user_lon < -180 OR user_lon > 180 THEN
        RETURN false;
    END IF;
    
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- PUBLIC_INTERFACE
-- RPC: Update user location
CREATE OR REPLACE FUNCTION update_user_location(
    p_user_id UUID,
    p_lat DOUBLE PRECISION,
    p_lon DOUBLE PRECISION
)
RETURNS BOOLEAN AS $$
BEGIN
    IF p_user_id IS NULL OR p_lat IS NULL OR p_lon IS NULL THEN
        RAISE EXCEPTION 'All parameters are required';
    END IF;
    
    IF p_lat < -90 OR p_lat > 90 THEN
        RAISE EXCEPTION 'Invalid latitude: must be between -90 and 90';
    END IF;
    
    IF p_lon < -180 OR p_lon > 180 THEN
        RAISE EXCEPTION 'Invalid longitude: must be between -180 and 180';
    END IF;
    
    UPDATE users
    SET last_seen_lat = p_lat,
        last_seen_lon = p_lon,
        last_seen_at = NOW()
    WHERE id = p_user_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
