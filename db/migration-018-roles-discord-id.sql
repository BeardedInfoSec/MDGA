-- Migration 018: Add discord_role_id column to roles table
-- Allows linking an RBAC role directly to a Discord role ID from the Roles tab

ALTER TABLE roles ADD COLUMN discord_role_id VARCHAR(20) DEFAULT NULL AFTER description;
