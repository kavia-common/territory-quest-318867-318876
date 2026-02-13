-- Row Level Security (RLS) Policies for TurfRun Game

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- ============================================
-- USERS TABLE POLICIES
-- ============================================

-- Policy: Users can view all other users (for leaderboards, zone ownership display)
DROP POLICY IF EXISTS "Users are viewable by everyone" ON users;
CREATE POLICY "Users are viewable by everyone"
    ON users FOR SELECT
    USING (true);

-- Policy: Users can insert their own profile (on signup)
DROP POLICY IF EXISTS "Users can insert their own profile" ON users;
CREATE POLICY "Users can insert their own profile"
    ON users FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

-- Policy: Users can update only their own profile
-- Note: Field-level validation is handled by triggers (see below)
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
CREATE POLICY "Users can update their own profile"
    ON users FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Policy: Users cannot delete their own profile (handled by auth cascade)
DROP POLICY IF EXISTS "Users cannot delete profiles" ON users;
CREATE POLICY "Users cannot delete profiles"
    ON users FOR DELETE
    USING (false);

-- ============================================
-- ZONES TABLE POLICIES
-- ============================================

-- Policy: Zones are viewable by everyone (for map display)
DROP POLICY IF EXISTS "Zones are viewable by everyone" ON zones;
CREATE POLICY "Zones are viewable by everyone"
    ON zones FOR SELECT
    USING (true);

-- Policy: Only through RPC functions can zones be created
-- This prevents direct INSERT and forces validation through capture_zone RPC
DROP POLICY IF EXISTS "Authenticated users can create zones" ON zones;
CREATE POLICY "Zones can only be created via RPC"
    ON zones FOR INSERT
    TO authenticated
    WITH CHECK (false); -- Will be overridden by SECURITY DEFINER functions

-- Policy: Only through RPC functions can zones be updated
-- This prevents direct UPDATE and forces validation through game mechanics
DROP POLICY IF EXISTS "Users can update zones they own or are attacking" ON zones;
CREATE POLICY "Zones can only be updated via RPC"
    ON zones FOR UPDATE
    TO authenticated
    USING (false)
    WITH CHECK (false); -- Will be overridden by SECURITY DEFINER functions

-- Policy: Zone owners can abandon their zones (delete)
DROP POLICY IF EXISTS "Zone owners can delete their zones" ON zones;
CREATE POLICY "Zone owners can abandon their zones"
    ON zones FOR DELETE
    TO authenticated
    USING (owner_id = auth.uid() AND status = 'safe');

-- ============================================
-- MISSIONS TABLE POLICIES
-- ============================================

-- Policy: Users can view only their own missions
DROP POLICY IF EXISTS "Users can view their own missions" ON missions;
CREATE POLICY "Users can view their own missions"
    ON missions FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Policy: Missions can only be created via RPC/triggers
DROP POLICY IF EXISTS "Missions created via system only" ON missions;
CREATE POLICY "Missions created via system only"
    ON missions FOR INSERT
    TO authenticated
    WITH CHECK (false); -- Will be overridden by SECURITY DEFINER functions

-- Policy: Missions can only be updated via RPC/triggers
DROP POLICY IF EXISTS "Missions updated via system only" ON missions;
CREATE POLICY "Missions updated via system only"
    ON missions FOR UPDATE
    TO authenticated
    USING (false)
    WITH CHECK (false); -- Will be overridden by SECURITY DEFINER functions

-- Policy: Users cannot delete missions
DROP POLICY IF EXISTS "Users cannot delete missions" ON missions;
CREATE POLICY "Users cannot delete missions"
    ON missions FOR DELETE
    USING (false);

-- ============================================
-- NOTIFICATIONS TABLE POLICIES
-- ============================================

-- Policy: Users can view only their own notifications
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
CREATE POLICY "Users can view their own notifications"
    ON notifications FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Policy: Notifications can only be created via system
DROP POLICY IF EXISTS "Notifications created via system only" ON notifications;
CREATE POLICY "Notifications created via system only"
    ON notifications FOR INSERT
    TO authenticated
    WITH CHECK (false); -- Will be overridden by SECURITY DEFINER functions

-- Policy: Users can mark their own notifications as read
-- Note: Field-level validation is handled by triggers (see below)
DROP POLICY IF EXISTS "Users can mark notifications as read" ON notifications;
CREATE POLICY "Users can mark notifications as read"
    ON notifications FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Policy: Users can delete their own notifications (to clear old ones)
DROP POLICY IF EXISTS "Users can delete their own notifications" ON notifications;
CREATE POLICY "Users can delete their own notifications"
    ON notifications FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

-- ============================================
-- ACTIVITY LOG TABLE POLICIES
-- ============================================

-- Policy: Users can view only their own activity log
DROP POLICY IF EXISTS "Users can view their own activity log" ON activity_log;
CREATE POLICY "Users can view their own activity log"
    ON activity_log FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Policy: Activity log can only be created via system
DROP POLICY IF EXISTS "Activity log created via system only" ON activity_log;
CREATE POLICY "Activity log created via system only"
    ON activity_log FOR INSERT
    TO authenticated
    WITH CHECK (false); -- Will be overridden by SECURITY DEFINER functions

-- Policy: Activity log cannot be updated
DROP POLICY IF EXISTS "Activity log cannot be updated" ON activity_log;
CREATE POLICY "Activity log cannot be updated"
    ON activity_log FOR UPDATE
    USING (false);

-- Policy: Activity log cannot be deleted by users
DROP POLICY IF EXISTS "Activity log cannot be deleted" ON activity_log;
CREATE POLICY "Activity log cannot be deleted"
    ON activity_log FOR DELETE
    USING (false);

-- ============================================
-- TRIGGERS FOR FIELD-LEVEL VALIDATION
-- ============================================

-- Trigger function: Prevent manipulation of sensitive user fields
CREATE OR REPLACE FUNCTION validate_user_sensitive_fields()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent decreasing total_ep (can only stay same or increase)
    IF NEW.total_ep < OLD.total_ep THEN
        RAISE EXCEPTION 'Cannot decrease total_ep';
    END IF;
    
    -- Prevent decreasing respect_level (can only stay same or increase)
    IF NEW.respect_level < OLD.respect_level THEN
        RAISE EXCEPTION 'Cannot decrease respect_level';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_user_fields_trigger ON users;
CREATE TRIGGER validate_user_fields_trigger
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION validate_user_sensitive_fields();

-- Trigger function: Validate notification updates (only allow marking as read)
CREATE OR REPLACE FUNCTION validate_notification_updates()
RETURNS TRIGGER AS $$
BEGIN
    -- Only allow marking as read, not unread
    IF OLD.read = false AND NEW.read = true THEN
        -- Ensure no other fields are modified
        IF OLD.notification_type != NEW.notification_type
           OR OLD.title != NEW.title
           OR OLD.message != NEW.message
           OR OLD.data IS DISTINCT FROM NEW.data THEN
            RAISE EXCEPTION 'Can only mark notifications as read, cannot modify other fields';
        END IF;
    ELSIF OLD.read = true AND NEW.read = false THEN
        RAISE EXCEPTION 'Cannot mark notifications as unread';
    ELSIF OLD.read = NEW.read THEN
        RAISE EXCEPTION 'Notification already in this state';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_notification_updates_trigger ON notifications;
CREATE TRIGGER validate_notification_updates_trigger
    BEFORE UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION validate_notification_updates();

-- ============================================
-- ADDITIONAL SECURITY FUNCTIONS
-- ============================================

-- Helper function to check if a user owns a zone
CREATE OR REPLACE FUNCTION user_owns_zone(zone_id TEXT, user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    IF zone_id IS NULL OR user_id IS NULL THEN
        RETURN false;
    END IF;
    
    RETURN EXISTS (
        SELECT 1 FROM zones
        WHERE id = zone_id AND owner_id = user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper function to check if a zone is attackable by a user
CREATE OR REPLACE FUNCTION zone_is_attackable(zone_id TEXT, user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    zone_owner UUID;
BEGIN
    IF zone_id IS NULL OR user_id IS NULL THEN
        RETURN false;
    END IF;
    
    SELECT owner_id INTO zone_owner FROM zones WHERE id = zone_id;
    RETURN zone_owner IS NULL OR zone_owner != user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper function to check if user is authenticated
CREATE OR REPLACE FUNCTION is_authenticated()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN auth.uid() IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
