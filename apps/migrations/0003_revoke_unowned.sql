-- Migration number: 0003 	 2026-10-22T09:00:00.000Z
-- Since #217, an owner who leaves a network, is removed from it, is made a member, or deletes their
-- account loses the API keys and invite links they made there, in the batch that changes their
-- membership. This revokes those made before then: every key still in use and every invite still open
-- whose maker isn't one of its network's owners now, a deleted maker (null) among them.
UPDATE api_keys SET revoked = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE revoked IS NULL AND NOT EXISTS (
  SELECT 1 FROM memberships m WHERE m.network_id = api_keys.network_id AND m.member_id = api_keys.created_by AND m.role = 'owner'
);
UPDATE invites SET revoked = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE used IS NULL AND revoked IS NULL AND NOT EXISTS (
  SELECT 1 FROM memberships m WHERE m.network_id = invites.network_id AND m.member_id = invites.created_by AND m.role = 'owner'
);
