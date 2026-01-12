-- Add discovered field to resource_spawns for hidden resource mechanics
ALTER TABLE "resource_spawns" ADD COLUMN "discovered" boolean DEFAULT true;
-- Create index for efficient discovery queries
CREATE INDEX "resource_spawns_discovered_idx" ON "resource_spawns" USING btree ("discovered");