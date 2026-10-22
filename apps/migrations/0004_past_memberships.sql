-- Migration number: 0004 	 2026-10-22T12:00:00.000Z
-- The networks a member left or was removed from (#205), so deleting their account later has those
-- networks' launches forget their name too, as their current networks' do. A row is written in the
-- batch that deletes the membership, and goes with the member or the network. Memberships that ended
-- before this migration left no record, so those networks keep the name.
CREATE TABLE past_memberships (
  network_id TEXT NOT NULL REFERENCES networks (id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  PRIMARY KEY (network_id, member_id)
);
CREATE INDEX past_memberships_member ON past_memberships (member_id);
