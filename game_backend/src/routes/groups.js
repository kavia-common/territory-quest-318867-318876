import express from 'express';
import Joi from 'joi';
import { authenticate } from '../middleware/auth.js';
import { getSupabaseClient } from '../utils/supabase.js';
import { validate, successResponse, errorResponse } from '../utils/validation.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// ============================================
// VALIDATION SCHEMAS
// ============================================

const createGroupSchema = {
  body: Joi.object({
    name: Joi.string().min(3).max(50).required().messages({
      'string.min': 'Group name must be at least 3 characters',
      'string.max': 'Group name must not exceed 50 characters',
      'any.required': 'Group name is required'
    }),
    description: Joi.string().max(500).optional().messages({
      'string.max': 'Description must not exceed 500 characters'
    }),
    max_members: Joi.number().integer().min(2).max(100).default(100).messages({
      'number.min': 'Group must allow at least 2 members',
      'number.max': 'Group cannot exceed 100 members'
    })
  })
};

const updateGroupSchema = {
  body: Joi.object({
    name: Joi.string().min(3).max(50).messages({
      'string.min': 'Group name must be at least 3 characters',
      'string.max': 'Group name must not exceed 50 characters'
    }),
    description: Joi.string().max(500).allow('').messages({
      'string.max': 'Description must not exceed 500 characters'
    })
  }).min(1)
};

const inviteCodeSchema = {
  body: Joi.object({
    expires_in_hours: Joi.number().integer().min(1).max(168).default(24).messages({
      'number.min': 'Expiration must be at least 1 hour',
      'number.max': 'Expiration cannot exceed 168 hours (7 days)'
    })
  })
};

const joinGroupSchema = {
  body: Joi.object({
    invite_code: Joi.string().uuid().required().messages({
      'string.guid': 'Invalid invite code format',
      'any.required': 'Invite code is required'
    })
  })
};

// ============================================
// GROUP ENDPOINTS
// ============================================

// PUBLIC_INTERFACE
/**
 * POST /api/groups
 * Create a new private group
 * 
 * @body {string} name - Group name (3-50 chars)
 * @body {string} [description] - Group description (max 500 chars)
 * @body {number} [max_members=100] - Maximum members allowed (2-100)
 * @returns {object} Created group with initial invite code
 */
router.post('/', authenticate, validate(createGroupSchema), async (req, res, next) => {
  try {
    const { name, description = '', max_members = 100 } = req.body;
    const userId = req.userId;

    logger.info(`Creating group: ${name}`, { creator_id: userId });

    const supabase = getSupabaseClient();

    // Check if user already owns a group (limit: 1 group per user as owner)
    const { data: existingGroup } = await supabase
      .from('groups')
      .select('id, name')
      .eq('owner_id', userId)
      .single();

    if (existingGroup) {
      return res.status(409).json(errorResponse('You already own a group. Delete it first to create a new one.', 409));
    }

    const groupId = uuidv4();
    const inviteCode = uuidv4();

    // Create group
    const { data: newGroup, error: groupError } = await supabase
      .from('groups')
      .insert({
        id: groupId,
        name,
        description,
        owner_id: userId,
        max_members,
        member_count: 1
      })
      .select()
      .single();

    if (groupError) {
      logger.error('Failed to create group:', groupError);
      return res.status(500).json(errorResponse('Failed to create group', 500));
    }

    // Add owner as first member
    const { error: memberError } = await supabase
      .from('group_members')
      .insert({
        group_id: groupId,
        user_id: userId,
        role: 'owner',
        joined_at: new Date().toISOString()
      });

    if (memberError) {
      logger.error('Failed to add owner as member:', memberError);
      // Rollback group creation
      await supabase.from('groups').delete().eq('id', groupId);
      return res.status(500).json(errorResponse('Failed to create group', 500));
    }

    // Create initial invite code
    const { data: invite, error: inviteError } = await supabase
      .from('group_invites')
      .insert({
        id: inviteCode,
        group_id: groupId,
        created_by: userId,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        max_uses: null
      })
      .select()
      .single();

    if (inviteError) {
      logger.warn('Failed to create initial invite code:', inviteError);
      // Don't fail group creation
    }

    logger.info(`Group created: ${groupId}`, { name, owner_id: userId });

    res.status(201).json(successResponse({
      group: newGroup,
      invite_code: invite?.id || null,
      invite_expires_at: invite?.expires_at || null
    }, 'Group created successfully'));
  } catch (error) {
    logger.error('Create group error:', error);
    next(error);
  }
});

// PUBLIC_INTERFACE
/**
 * GET /api/groups/my
 * Get groups that the current user is a member of
 * 
 * @returns {array} List of groups with membership info
 */
router.get('/my', authenticate, async (req, res, next) => {
  try {
    const userId = req.userId;

    const supabase = getSupabaseClient();

    const { data: memberships, error } = await supabase
      .from('group_members')
      .select(`
        role,
        joined_at,
        groups:group_id (
          id,
          name,
          description,
          owner_id,
          max_members,
          member_count,
          created_at
        )
      `)
      .eq('user_id', userId);

    if (error) {
      logger.error('Failed to fetch user groups:', error);
      return res.status(500).json(errorResponse('Failed to fetch groups', 500));
    }

    const groups = (memberships || []).map(m => ({
      ...m.groups,
      my_role: m.role,
      joined_at: m.joined_at
    }));

    res.json(successResponse({ groups }));
  } catch (error) {
    logger.error('Get my groups error:', error);
    next(error);
  }
});

// PUBLIC_INTERFACE
/**
 * GET /api/groups/:groupId
 * Get group details and member list
 * 
 * @param {string} groupId - Group UUID
 * @returns {object} Group details with members
 */
router.get('/:groupId', authenticate, async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.userId;

    const supabase = getSupabaseClient();

    // Check if user is a member
    const { data: membership } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();

    if (!membership) {
      return res.status(403).json(errorResponse('You are not a member of this group', 403));
    }

    // Get group details
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('*')
      .eq('id', groupId)
      .single();

    if (groupError || !group) {
      return res.status(404).json(errorResponse('Group not found', 404));
    }

    // Get members
    const { data: members, error: membersError } = await supabase
      .from('group_members')
      .select(`
        user_id,
        role,
        joined_at,
        users:user_id (
          username,
          color_hex,
          total_ep,
          respect_level
        )
      `)
      .eq('group_id', groupId)
      .order('joined_at', { ascending: true });

    if (membersError) {
      logger.error('Failed to fetch group members:', membersError);
    }

    const memberList = (members || []).map(m => ({
      user_id: m.user_id,
      username: m.users?.username,
      color_hex: m.users?.color_hex,
      total_ep: m.users?.total_ep,
      respect_level: m.users?.respect_level,
      role: m.role,
      joined_at: m.joined_at
    }));

    res.json(successResponse({
      group,
      my_role: membership.role,
      members: memberList
    }));
  } catch (error) {
    logger.error('Get group details error:', error);
    next(error);
  }
});

// PUBLIC_INTERFACE
/**
 * PUT /api/groups/:groupId
 * Update group details (owner only)
 * 
 * @param {string} groupId - Group UUID
 * @body {string} [name] - New group name
 * @body {string} [description] - New description
 * @returns {object} Updated group
 */
router.put('/:groupId', authenticate, validate(updateGroupSchema), async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.userId;
    const updates = req.body;

    const supabase = getSupabaseClient();

    // Check if user is owner
    const { data: group } = await supabase
      .from('groups')
      .select('owner_id')
      .eq('id', groupId)
      .single();

    if (!group) {
      return res.status(404).json(errorResponse('Group not found', 404));
    }

    if (group.owner_id !== userId) {
      return res.status(403).json(errorResponse('Only the group owner can update group details', 403));
    }

    // Update group
    const { data: updatedGroup, error } = await supabase
      .from('groups')
      .update(updates)
      .eq('id', groupId)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update group:', error);
      return res.status(500).json(errorResponse('Failed to update group', 500));
    }

    logger.info(`Group updated: ${groupId}`, updates);

    res.json(successResponse(updatedGroup, 'Group updated successfully'));
  } catch (error) {
    logger.error('Update group error:', error);
    next(error);
  }
});

// PUBLIC_INTERFACE
/**
 * POST /api/groups/:groupId/invite
 * Generate a new invite code for the group (owner/admin only)
 * 
 * @param {string} groupId - Group UUID
 * @body {number} [expires_in_hours=24] - Hours until invite expires (1-168)
 * @returns {object} New invite code and expiration
 */
router.post('/:groupId/invite', authenticate, validate(inviteCodeSchema), async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.userId;
    const { expires_in_hours = 24 } = req.body;

    const supabase = getSupabaseClient();

    // Check if user is owner or admin
    const { data: membership } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return res.status(403).json(errorResponse('Only group owner or admins can create invite codes', 403));
    }

    const inviteCode = uuidv4();
    const expiresAt = new Date(Date.now() + expires_in_hours * 60 * 60 * 1000);

    const { data: invite, error } = await supabase
      .from('group_invites')
      .insert({
        id: inviteCode,
        group_id: groupId,
        created_by: userId,
        expires_at: expiresAt.toISOString(),
        max_uses: null
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create invite code:', error);
      return res.status(500).json(errorResponse('Failed to create invite code', 500));
    }

    logger.info(`Invite code created for group: ${groupId}`, { created_by: userId });

    res.status(201).json(successResponse({
      invite_code: invite.id,
      expires_at: invite.expires_at,
      group_id: groupId
    }, 'Invite code created successfully'));
  } catch (error) {
    logger.error('Create invite code error:', error);
    next(error);
  }
});

// PUBLIC_INTERFACE
/**
 * POST /api/groups/join
 * Join a group using an invite code
 * 
 * @body {string} invite_code - Valid invite code UUID
 * @returns {object} Group joined information
 */
router.post('/join', authenticate, validate(joinGroupSchema), async (req, res, next) => {
  try {
    const { invite_code } = req.body;
    const userId = req.userId;

    logger.info(`User attempting to join group with invite: ${invite_code}`, { user_id: userId });

    const supabase = getSupabaseClient();

    // Get invite details
    const { data: invite, error: inviteError } = await supabase
      .from('group_invites')
      .select('group_id, expires_at, max_uses, used_count')
      .eq('id', invite_code)
      .single();

    if (inviteError || !invite) {
      return res.status(404).json(errorResponse('Invalid invite code', 404));
    }

    // Check if invite is expired
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(400).json(errorResponse('This invite code has expired', 400));
    }

    // Check if invite has reached max uses
    if (invite.max_uses !== null && invite.used_count >= invite.max_uses) {
      return res.status(400).json(errorResponse('This invite code has reached its usage limit', 400));
    }

    // Get group details
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('*')
      .eq('id', invite.group_id)
      .single();

    if (groupError || !group) {
      return res.status(404).json(errorResponse('Group not found', 404));
    }

    // Check if group is full
    if (group.member_count >= group.max_members) {
      return res.status(400).json(errorResponse('This group is full', 400));
    }

    // Check if user is already a member
    const { data: existingMembership } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', invite.group_id)
      .eq('user_id', userId)
      .single();

    if (existingMembership) {
      return res.status(409).json(errorResponse('You are already a member of this group', 409));
    }

    // Add user to group
    const { error: memberError } = await supabase
      .from('group_members')
      .insert({
        group_id: invite.group_id,
        user_id: userId,
        role: 'member',
        joined_at: new Date().toISOString()
      });

    if (memberError) {
      logger.error('Failed to add user to group:', memberError);
      return res.status(500).json(errorResponse('Failed to join group', 500));
    }

    // Increment group member count
    await supabase
      .from('groups')
      .update({ member_count: group.member_count + 1 })
      .eq('id', invite.group_id);

    // Increment invite used count
    await supabase
      .from('group_invites')
      .update({ used_count: invite.used_count + 1 })
      .eq('id', invite_code);

    logger.info(`User joined group: ${invite.group_id}`, { user_id: userId });

    res.status(201).json(successResponse({
      group_id: group.id,
      group_name: group.name,
      member_count: group.member_count + 1,
      max_members: group.max_members
    }, 'Successfully joined group'));
  } catch (error) {
    logger.error('Join group error:', error);
    next(error);
  }
});

// PUBLIC_INTERFACE
/**
 * DELETE /api/groups/:groupId/leave
 * Leave a group (members and admins only, owner cannot leave)
 * 
 * @param {string} groupId - Group UUID
 * @returns {object} Success message
 */
router.delete('/:groupId/leave', authenticate, async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.userId;

    const supabase = getSupabaseClient();

    // Check membership
    const { data: membership } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();

    if (!membership) {
      return res.status(404).json(errorResponse('You are not a member of this group', 404));
    }

    if (membership.role === 'owner') {
      return res.status(400).json(errorResponse('Group owner cannot leave. Transfer ownership or delete the group.', 400));
    }

    // Remove user from group
    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);

    if (error) {
      logger.error('Failed to leave group:', error);
      return res.status(500).json(errorResponse('Failed to leave group', 500));
    }

    // Decrement member count
    await supabase.rpc('decrement_group_member_count', { group_id: groupId });

    logger.info(`User left group: ${groupId}`, { user_id: userId });

    res.json(successResponse(null, 'Successfully left group'));
  } catch (error) {
    logger.error('Leave group error:', error);
    next(error);
  }
});

// PUBLIC_INTERFACE
/**
 * DELETE /api/groups/:groupId
 * Delete a group (owner only)
 * 
 * @param {string} groupId - Group UUID
 * @returns {object} Success message
 */
router.delete('/:groupId', authenticate, async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.userId;

    const supabase = getSupabaseClient();

    // Check if user is owner
    const { data: group } = await supabase
      .from('groups')
      .select('owner_id')
      .eq('id', groupId)
      .single();

    if (!group) {
      return res.status(404).json(errorResponse('Group not found', 404));
    }

    if (group.owner_id !== userId) {
      return res.status(403).json(errorResponse('Only the group owner can delete the group', 403));
    }

    // Delete group (cascades to members and invites)
    const { error } = await supabase
      .from('groups')
      .delete()
      .eq('id', groupId);

    if (error) {
      logger.error('Failed to delete group:', error);
      return res.status(500).json(errorResponse('Failed to delete group', 500));
    }

    logger.info(`Group deleted: ${groupId}`, { owner_id: userId });

    res.json(successResponse(null, 'Group deleted successfully'));
  } catch (error) {
    logger.error('Delete group error:', error);
    next(error);
  }
});

export default router;
